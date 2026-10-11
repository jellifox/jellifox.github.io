// 把用户选择 + 仓库解析数据组装为 E5StatblockIn 角色卡。
// 自动应用：背景属性加值、职业豁免/技能熟练、种族体型速度特质、
// 职业等级特性、子职特性、法术位/DC、武器攻击动作。

import type {
  AbilityKey, Action, BackgroundData, CharacterChoices, ClassData, E5Statblock,
  LoadedEntities, RepoMeta, SkillKey, Skills, SpeciesData, SpellSlots, TraitEntry,
} from '../types'
import {
  ABILITY_CN, ABILITY_FULL_EN, ABILITY_KEYS, SKILL_ABILITY, SIZE_CN_TO_EN,
  cnToSkill, mergeAbilityBonus, parseAbilityBonus, type AbilityBonusSpec,
} from '../data/mappings'
import { subclassFeatureLevel } from '../data/parsers'
import {
  ARMORS, WEAPONS, abilityMod, armorClassValue, fmtMod, hpPerLevelAverage,
  proficiencyBonus, weaponAttackAbility,
} from './rules'
import {
  classInstances, classSummary, hitDiceLabel, hitDieSequence, spellSlotsFor,
} from './multiclass'

export interface DerivedAbilities {
  base: Record<AbilityKey, number>
  /** 种族 + 背景加值（角色创建时确定） */
  bonus: Record<AbilityKey, number>
  /** 成长：专长与升级属性值提升带来的增长 */
  growth: Record<AbilityKey, number>
  total: Record<AbilityKey, number>
  mods: Record<AbilityKey, number>
}

/**
 * 计算背景 +2/+1 的有效落点：未显式选择时回退到背景列出的前两项，
 * 保证永远是有效属性（无需空占位项），且下拉显示值与实际加值一致。
 */
export function effectiveBgChoice(
  c: CharacterChoices,
  bg: BackgroundData | null
): { plus2: AbilityKey | null; plus1: AbilityKey | null } {
  if (!bg || bg.abilities.length === 0) return { plus2: null, plus1: null }
  const plus2 =
    c.bgPlus2 && bg.abilities.includes(c.bgPlus2) ? c.bgPlus2 : bg.abilities[0]
  const plus1 =
    c.bgPlus1 && bg.abilities.includes(c.bgPlus1) && c.bgPlus1 !== plus2
      ? c.bgPlus1
      : bg.abilities.find(k => k !== plus2) ?? null
  return { plus2, plus1 }
}

/**
 * 种族的实际生效特质 = 共通特质 + 所选亚种的特质。
 * 谦卑林等扩展把「共通特质 + 若干亚种」放在同一页（如鸦族下的昏鸦族/煽鸦族），
 * 只取共通特质会漏掉亚种加成，因此所有消费方都应经由本函数取用。
 */
export function speciesTraits(
  species: SpeciesData | null | undefined,
  subraceChoice: string
): TraitEntry[] {
  if (!species) return []
  // 经 effectiveSubrace 解析：未选择时按界面显示的默认（第一个）生效，
  // 避免「界面显示已选中某亚种、角色卡却没算它的特质」。
  const name = effectiveSubrace(species, subraceChoice)
  const sub = (species.subraces ?? []).find(s => s.name === name)
  return sub ? [...species.traits, ...sub.traits] : species.traits
}

/** 亚种未选或已失效时回退到第一个（保证有亚种的种族总有确定结果） */
export function effectiveSubrace(species: SpeciesData | null | undefined, choice: string): string {
  const subs = species?.subraces ?? []
  if (subs.length === 0) return ''
  return subs.some(s => s.name === choice) ? choice : subs[0].name
}

/**
 * 生命值上限的唯一计算入口（角色卡预览、面团导出、属性面板都经由此处，避免各算各的）。
 * 兼职规则：只有起始职业的 1 级取生命骰最大值，其余每一级（含兼职职业的第一级）
 * 都按该级所属职业的生命骰取平均或投骰。最后加上种族/专长的每级加成。
 * 手动模式直接采用用户填写的数值，不再叠加任何加成。
 */
export function deriveHp(
  c: CharacterChoices,
  loaded: LoadedEntities,
  spTraits: TraitEntry[],
  conMod: number
): { max: number; hitDie: number; dice: number[]; bonusPerLevel: number; source: string } {
  const seq = hitDieSequence(classInstances(c, loaded))
  const hitDie = seq[0] ?? 8
  // 职业尚未加载时按 d8 占位，保证有结果
  const dice = seq.length ? seq : Array.from({ length: c.level }, () => 8)

  // 每级额外生命值：矮人刚毅（生命值上限加1/级）、强健身心 Tough（+2/级）
  let bonusPerLevel = 0
  if (spTraits.some(t => /生命值上限加1/.test(t.desc))) bonusPerLevel += 1
  if (Object.values(c.feats).some(f => /强健身心|Tough/i.test(f.name))) bonusPerLevel += 2

  if (c.hpMethod === 'manual' && c.hpManual != null) {
    return { max: Math.max(1, c.hpManual), hitDie, dice, bonusPerLevel, source: '手动指定' }
  }
  let base = dice[0] + conMod
  for (let i = 1; i < dice.length; i++) {
    const r = c.hpMethod === 'roll'
      ? (c.hpRolls[i - 1] ?? hpPerLevelAverage(dice[i]))
      : hpPerLevelAverage(dice[i])
    base += r + conMod
  }
  return {
    max: Math.max(dice.length, base) + bonusPerLevel * dice.length,
    hitDie,
    dice,
    bonusPerLevel,
    source: c.hpMethod === 'roll' ? '逐级投骰' : '固定平均值',
  }
}

// ---------- 专长槽位（按 5R 升级规则从职业等级表推导） ----------

export interface FeatSlot {
  key: string // choices.feats 的键（兼职职业带 'mc0:' 前缀）
  label: string
  kind: 'general' | 'style' | 'epic'
  level: number // 该槽位对应的职业等级
}

/**
 * 从职业等级表推导当前等级的专长槽位：
 * - 表中「属性值提升」的等级（4/8/12/16，战士额外 6/14）-> 通用专长槽（可选属性值提升）
 * - 「战斗风格」特性 -> 战斗风格专长槽
 * - 「传奇恩惠」（19级）-> 传奇恩惠专长槽
 * 起源专长来自背景，不在此列。
 */
export function featSlots(
  cls: ClassData | null,
  level: number,
  prefix = '',
  classTag = ''
): FeatSlot[] {
  if (!cls) return []
  const out: FeatSlot[] = []
  let hasStyle = false
  for (const row of cls.levels) {
    if (row.level > level) break
    const fs = row.features.join(' ')
    if (!hasStyle && /战斗风格/.test(fs)) {
      hasStyle = true
      out.push({ key: `${prefix}style`, label: `${classTag}战斗风格（${row.level}级职业特性）`, kind: 'style', level: row.level })
    }
    if (/属性值提升/.test(fs)) {
      out.push({ key: `${prefix}lv${row.level}`, label: `${classTag}${row.level}级 · 属性值提升或通用专长`, kind: 'general', level: row.level })
    }
    if (/传奇恩惠/.test(fs)) {
      out.push({ key: `${prefix}lv${row.level}epic`, label: `${classTag}${row.level}级 · 传奇恩惠`, kind: 'epic', level: row.level })
    }
  }
  // 等级表缺失/未解析出提升行时退回标准 4/8/12/16（19 传奇恩惠）
  if (!out.some(s => s.kind === 'general')) {
    for (const lv of [4, 8, 12, 16]) {
      if (lv <= level) out.push({ key: `${prefix}lv${lv}`, label: `${classTag}${lv}级 · 属性值提升或通用专长`, kind: 'general', level: lv })
    }
  }
  if (level >= 19 && !out.some(s => s.kind === 'epic')) {
    out.push({ key: `${prefix}lv19epic`, label: `${classTag}19级 · 传奇恩惠`, kind: 'epic', level: 19 })
  }
  return out
}

/**
 * 所有职业的专长槽位。兼职规则下属性值提升按「各职业自己的等级」给出
 * （如术士4/圣武士1 只在术士4级有一次），因此逐职业实例计算再合并。
 * 起始职业键不带前缀以兼容旧存档；仅兼职时才在标签前注明职业名。
 */
export function allFeatSlots(c: CharacterChoices, loaded: LoadedEntities): FeatSlot[] {
  const inst = classInstances(c, loaded)
  const tag = inst.length > 1
  return inst.flatMap(i => featSlots(i.cls, i.level, i.keyPrefix, tag ? `${i.cls.nameCn}` : ''))
}

/**
 * 一个待用户分配的属性加值槽位（来自种族特质或已选专长）。
 * key 用于在 choices.abilityPicks 中定位，稳定不随渲染变化。
 */
export interface PendingBonus {
  key: string
  source: string // 显示用来源，如「种族·鸦族」「4级专长·运动精英」
  amount: number
  options: AbilityKey[] // 空数组 = 任意属性
}

/** 某来源可选的方案数（>1 表示原文用「或者」给了并列方案） */
export interface BonusSource {
  key: string // 方案选择键
  source: string
  spec: AbilityBonusSpec
}

/** 种族特质给出的属性加值（含被当作元信息的「属性值提升」原文） */
export function speciesAbilityBonus(
  species: SpeciesData | null | undefined,
  subraceChoice: string
): AbilityBonusSpec {
  if (!species) return { fixed: {}, schemes: [] }
  const name = effectiveSubrace(species, subraceChoice)
  const sub = (species.subraces ?? []).find(s => s.name === name)
  const texts = [
    ...speciesTraits(species, subraceChoice).map(t => t.desc),
    species.abilityBonusText ?? '',
    sub?.abilityBonusText ?? '',
  ]
  return mergeAbilityBonus(texts.map(parseAbilityBonus))
}

/**
 * 所有会带来属性加值的来源：种族 + 每个已选专长。
 * 专长按槽位分别列出，因为同一个专长可能被选进多个槽位。
 */
export function bonusSources(
  c: CharacterChoices,
  loaded: LoadedEntities
): BonusSource[] {
  const out: BonusSource[] = []
  const sp = speciesAbilityBonus(loaded.species, c.subraceChoice)
  if (Object.keys(sp.fixed).length || sp.schemes.length) {
    out.push({ key: 'species', source: `种族·${loaded.species?.nameCn ?? ''}`, spec: sp })
  }
  // 槽位标签取自 allFeatSlots，兼职职业的键带 'mc0:' 前缀，不能再靠解析键名
  const labels = new Map(allFeatSlots(c, loaded).map(sl => [sl.key, sl.label.replace(/ · .*$/, '')]))
  const slotLabel = (k: string) =>
    k === 'origin' ? '起源专长' : labels.get(k) ?? '专长'
  for (const [slotKey, feat] of Object.entries(c.feats)) {
    const spec = parseAbilityBonus(feat.desc)
    if (!Object.keys(spec.fixed).length && !spec.schemes.length) continue
    out.push({ key: `feat:${slotKey}`, source: `${slotLabel(slotKey)}·${feat.name}`, spec })
  }
  return out
}

/** 某来源当前生效的方案索引（越界时回退到 0） */
export function effectiveScheme(src: BonusSource, chosen: number | undefined): number {
  return chosen != null && chosen >= 0 && chosen < src.spec.schemes.length ? chosen : 0
}

/** 展开为待分配槽位列表（已按所选方案取舍） */
export function pendingBonuses(c: CharacterChoices, loaded: LoadedEntities): PendingBonus[] {
  const out: PendingBonus[] = []
  for (const src of bonusSources(c, loaded)) {
    const scheme = src.spec.schemes[effectiveScheme(src, c.bonusSchemes[src.key])] ?? []
    scheme.forEach((ch, i) => {
      out.push({ key: `${src.key}:${i}`, source: src.source, amount: ch.amount, options: ch.options })
    })
  }
  return out
}

/** 固定加值合计（种族 + 专长，无需用户分配的部分） */
export function fixedBonuses(
  c: CharacterChoices,
  loaded: LoadedEntities
): { species: Partial<Record<AbilityKey, number>>; feats: Partial<Record<AbilityKey, number>> } {
  const species = speciesAbilityBonus(loaded.species, c.subraceChoice).fixed
  const feats: Partial<Record<AbilityKey, number>> = {}
  for (const feat of Object.values(c.feats)) {
    for (const [k, v] of Object.entries(parseAbilityBonus(feat.desc).fixed) as [AbilityKey, number][]) {
      feats[k] = (feats[k] ?? 0) + v
    }
  }
  return { species, feats }
}

export function deriveAbilities(
  c: CharacterChoices,
  bg: BackgroundData | null,
  species?: SpeciesData | null,
  loaded?: LoadedEntities
): DerivedAbilities {
  const base = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, c.baseScores[k] ?? 10])
  ) as Record<AbilityKey, number>

  const bonus = Object.fromEntries(ABILITY_KEYS.map(k => [k, 0])) as Record<AbilityKey, number>
  const growth = Object.fromEntries(ABILITY_KEYS.map(k => [k, 0])) as Record<AbilityKey, number>

  // 种族固定加值（2014/第三方种族；2024 种族一般为空）
  if (species) {
    for (const [k, v] of Object.entries(speciesAbilityBonus(species, c.subraceChoice).fixed) as [AbilityKey, number][]) {
      bonus[k] += v
    }
  }

  // 背景加值（2024 规则的主要来源）
  if (bg && bg.abilities.length > 0) {
    if (c.bgBonusMode === '1+1+1') {
      for (const k of bg.abilities) bonus[k] += 1
    } else {
      const { plus2, plus1 } = effectiveBgChoice(c, bg)
      if (plus2) bonus[plus2] += 2
      if (plus1 && plus1 !== plus2) bonus[plus1] += 1
    }
  }

  // 专长固定加值 + 所有待分配槽位 -> 成长栏
  if (loaded) {
    for (const feat of Object.values(c.feats)) {
      for (const [k, v] of Object.entries(parseAbilityBonus(feat.desc).fixed) as [AbilityKey, number][]) {
        growth[k] += v
      }
    }
    for (const pb of pendingBonuses(c, loaded)) {
      const k = c.abilityPicks[pb.key]
      if (!k) continue
      // 种族的自选加值属于创建时加值，专长的属于成长
      if (pb.key.startsWith('species')) bonus[k] += pb.amount
      else growth[k] += pb.amount
    }
  }

  // 2024 规则：属性值上限 20
  const total = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, Math.min(20, base[k] + bonus[k] + growth[k])])
  ) as Record<AbilityKey, number>
  const mods = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, abilityMod(total[k])])
  ) as Record<AbilityKey, number>
  return { base, bonus, growth, total, mods }
}

function classLevelRow(cls: ClassData | undefined, level: number) {
  return cls?.levels.find(r => r.level === level)
}

/** 已获得的职业特性（聚合 1..level 级） */
export function gainedFeatures(cls: ClassData | undefined, level: number): { level: number; name: string }[] {
  if (!cls) return []
  const out: { level: number; name: string }[] = []
  for (const row of cls.levels) {
    if (row.level > level) break
    for (const f of row.features) out.push({ level: row.level, name: f })
  }
  return out
}

export function buildStatblock(
  c: CharacterChoices,
  meta: RepoMeta | null,
  loaded: LoadedEntities
): E5Statblock {
  const cls = loaded.cls ?? undefined
  const sub = loaded.subclass ?? undefined
  const species = loaded.species ?? undefined
  const bg = loaded.background ?? undefined

  const ab = deriveAbilities(c, loaded.background, species, loaded)
  const pb = proficiencyBonus(c.level)
  const level = c.level
  // 共通特质 + 所选亚种特质
  const spTraits = speciesTraits(species, c.subraceChoice)

  // ---- 生命值 / 护甲 ----
  const hpInfo = deriveHp(c, loaded, spTraits, ab.mods.CON)
  const hp = hpInfo.max
  const inst = classInstances(c, loaded)

  const armor = ARMORS.find(a => a.id === c.armorId) ?? ARMORS[0]
  const acValue = armorClassValue(armor, ab.mods.DEX, c.shield)
  const acSpecial = [
    armor.id === 'none' ? null : `${armor.nameCn} ${armor.nameEn}`,
    c.shield ? '盾牌' : null,
  ].filter(Boolean).join('，') || null

  // ---- 豁免 / 技能 ----
  const savingThrows: E5Statblock['saving_throws'] = {}
  for (const k of cls?.saves ?? []) {
    savingThrows[`${ABILITY_FULL_EN[k]}_save` as keyof typeof savingThrows] = ab.mods[k] + pb
  }

  const profSkills = new Set<SkillKey>([
    ...(bg?.skills ?? []),
    ...c.classSkills,
    // 兼职职业给的那一项自选技能
    ...(c.multiclasses ?? []).map(m => m.skill).filter((x): x is SkillKey => !!x),
  ])
  // 种族特质授予的技能熟练（如兔人的“小兔感官：你拥有察觉技能的熟练”）
  for (const t of spTraits) {
    const m = t.desc.match(/拥有(?:对)?([^\n。，]{1,6})技能的熟练|获得([^\n。，]{1,6})技能熟练/)
    if (m) {
      const sk = cnToSkill((m[1] ?? m[2]).trim())
      if (sk) profSkills.add(sk)
    }
  }
  const skills: Skills = {}
  for (const s of profSkills) {
    skills[s] = ab.mods[SKILL_ABILITY[s]] + pb
  }
  const passivePerception = 10 + ab.mods.WIS + (profSkills.has('perception') ? pb : 0)

  // ---- 感官（从种族特质中提取黑暗视觉等） ----
  const senses: string[] = []
  for (const t of spTraits) {
    const m = (t.name + t.desc).match(/(\d+)\s*尺.{0,4}黑暗视觉|黑暗视觉.{0,8}?(\d+)\s*尺/)
    if (/黑暗视觉/.test(t.name) && m) {
      senses.push(`黑暗视觉 ${m[1] ?? m[2]}尺`)
    }
  }
  senses.push(`被动察觉 ${passivePerception}`)

  // ---- 特殊能力：种族特质 + 背景专长 + 职业特性 + 子职特性 ----
  const specials: Action[] = []
  for (const t of spTraits) {
    specials.push({ name: `【种族】${t.name}`, desc: t.desc })
  }
  if (bg?.feat) {
    const origin = c.feats['origin']
    specials.push(
      origin
        ? { name: `【起源专长】${origin.name}`, desc: origin.desc }
        : { name: `【起源专长】${bg.feat}`, desc: `来自背景「${bg.nameCn}」。` }
    )
  }
  for (const slot of allFeatSlots(c, loaded)) {
    const f = c.feats[slot.key]
    if (!f) continue
    const tag =
      slot.kind === 'style' ? '战斗风格' :
      slot.kind === 'epic' ? '传奇恩惠' :
      `${slot.level}级专长`
    specials.push({ name: `【${tag}】${f.name}`, desc: f.desc })
  }
  // 职业特性按各职业自己的等级给出（兼职规则）
  for (const i of inst) {
    const gained = gainedFeatures(i.cls, i.level)
    if (gained.length) {
      const byLevel = new Map<number, string[]>()
      for (const f of gained) byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f.name])
      const lines = [...byLevel.entries()].map(([lv, names]) => `${lv}级：${names.join('、')}`)
      specials.push({ name: `【职业特性】${i.cls.nameCn}${inst.length > 1 ? ` ${i.level}级` : ''}`, desc: lines.join('\n') })
    }
    if (i.subclass) {
      for (const f of i.subclass.features) {
        if (subclassFeatureLevel(f.name) <= i.level) {
          specials.push({ name: `【子职·${i.subclass.nameCn}】${f.name}`, desc: f.desc })
        }
      }
    }
  }

  // ---- 武器攻击动作 ----
  const actions: Action[] = []
  for (const wid of c.weaponIds) {
    const w = WEAPONS.find(x => x.id === wid)
    if (!w) continue
    const atkAb = weaponAttackAbility(w, ab.mods.STR, ab.mods.DEX)
    const atkMod = ab.mods[atkAb]
    const parts: string[] = []
    parts.push(w.ranged ? `远程攻击：射程${w.range}` : '近战攻击：触及5尺')
    if (w.thrown && !w.ranged) parts.push(`可投掷(${w.range})`)
    if (w.versatile) parts.push(`双手持用时伤害为${w.versatile}`)
    parts.push(`${w.damageType}伤害`)
    actions.push({
      name: `${w.nameCn} ${w.nameEn}`,
      desc: parts.join('，') + '。',
      attack_bonus: atkMod + pb,
      stat_bonus: [atkAb],
      damage_dice: `${w.dice}${atkMod !== 0 ? fmtMod(atkMod) : ''}`,
    })
  }

  // ---- 法术 ----
  // 兼职时按「兼职施法者表」合算法术位；契约魔法独立计算
  const slotInfo = spellSlotsFor(inst)
  const spellSlots: SpellSlots[] = []
  for (const [lv, count] of Object.entries(slotInfo.slots)) {
    spellSlots.push({
      level: parseInt(lv, 10),
      limit: { name: `${lv}环法术位`, uses: count as number, resets: ['长休'] },
    })
  }
  if (slotInfo.pact) {
    spellSlots.push({
      level: slotInfo.pact.level,
      limit: { name: '魔契法术位', uses: slotInfo.pact.count, resets: ['短休', '长休'] },
    })
  }
  // 法术 DC / 攻击：列出每个施法职业（各自用自己的施法属性）
  const casterClasses = inst.filter(i => i.cls.spellAbility)
  let spellDc: string | null = null
  let spellAttack: string | null = null
  if (casterClasses.length && spellSlots.length > 0) {
    spellDc = casterClasses
      .map(i => `${8 + pb + ab.mods[i.cls.spellAbility!]}（${ABILITY_CN[i.cls.spellAbility!]}${casterClasses.length > 1 ? '·' + i.cls.nameCn : ''}）`)
      .filter((v, k, a) => a.indexOf(v) === k)
      .join(' / ')
    spellAttack = casterClasses
      .map(i => fmtMod(pb + ab.mods[i.cls.spellAbility!]))
      .filter((v, k, a) => a.indexOf(v) === k)
      .join(' / ')
  }
  const spells = [
    ...c.spells,
    ...c.spellsText.split('\n').map(s => s.trim()).filter(Boolean),
  ]

  // ---- 物品 ----
  const items: string[] = []
  if (cls && c.classEquipChoice >= 0 && cls.equipmentOptions[c.classEquipChoice]) {
    items.push(`职业装备：${cls.equipmentOptions[c.classEquipChoice]}`)
  }
  if (bg && c.bgEquipChoice >= 0 && bg.equipmentOptions[c.bgEquipChoice]) {
    items.push(`背景装备：${bg.equipmentOptions[c.bgEquipChoice]}`)
  }
  if (bg?.tool) items.push(`工具熟练：${bg.tool}`)
  for (const wid of c.weaponIds) {
    const w = WEAPONS.find(x => x.id === wid)
    if (w) items.push(`${w.nameCn} ${w.nameEn}`)
  }
  if (armor.id !== 'none') items.push(`${armor.nameCn} ${armor.nameEn}`)
  if (c.shield) items.push('盾牌 Shield')

  // ---- about ----
  const aboutParts: string[] = []
  if (species) aboutParts.push(`种族：${species.nameCn} ${species.nameEn}`)
  if (inst.length) {
    aboutParts.push(`职业：${inst.map(i => `${i.cls.nameCn} ${i.level}级${i.subclass ? `（${i.subclass.nameCn}）` : ''}`).join(' / ')}`)
  }
  if (bg) aboutParts.push(`背景：${bg.nameCn} ${bg.nameEn}`)
  if (c.about.trim()) aboutParts.push(c.about.trim())

  const sizeCn = c.sizeChoice || species?.sizeOptions[0] || '中型'

  return {
    name: c.name || '未命名冒险者',
    about: aboutParts.join('；') || null,
    size: SIZE_CN_TO_EN[sizeCn] ?? 'Medium',
    type: 'humanoid',
    subtype: species ? `${species.nameCn} ${species.nameEn}`.trim() : null,
    group: inst.length ? classSummary(inst) : null,
    alignment: c.alignment,
    armor_class: { value: acValue, special: acSpecial },
    hp: { value: hp, hit_dice: inst.length ? hitDiceLabel(inst) : null },
    speed: { walk: species?.speed ?? 30 },
    stats: {
      strength: ab.total.STR,
      dexterity: ab.total.DEX,
      constitution: ab.total.CON,
      intelligence: ab.total.INT,
      wisdom: ab.total.WIS,
      charisma: ab.total.CHA,
    },
    saving_throws: savingThrows,
    perception: passivePerception,
    skills: Object.keys(skills).length ? skills : null,
    senses,
    languages: c.languages,
    items,
    actions,
    special_abilities: specials,
    spell_slots: spellSlots,
    spells,
    spell_dc: spellDc,
    spell_attack: spellAttack,
    challenge_rating: null,
    cr: null,
    source: meta
      ? `5E不全书 ${meta.branch}@${meta.shortSha}（DND5eChm/DND5e_chm）`
      : null,
  }
}
