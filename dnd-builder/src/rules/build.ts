// 把用户选择 + 仓库解析数据组装为 E5StatblockIn 角色卡。
// 自动应用：背景属性加值、职业豁免/技能熟练、种族体型速度特质、
// 职业等级特性、子职特性、法术位/DC、武器攻击动作。

import type {
  AbilityKey, Action, BackgroundData, CharacterChoices, ClassData, E5Statblock,
  LoadedEntities, RepoMeta, SkillKey, Skills, SpeciesData, SpellSlots, TraitEntry,
} from '../types'
import {
  ABILITY_CN, ABILITY_FULL_EN, ABILITY_KEYS, SKILL_ABILITY, SIZE_CN_TO_EN,
  cnToSkill,
} from '../data/mappings'
import { subclassFeatureLevel } from '../data/parsers'
import {
  ARMORS, WEAPONS, abilityMod, armorClassValue, averageHp, fmtMod,
  proficiencyBonus, rolledHp, weaponAttackAbility,
} from './rules'

export interface DerivedAbilities {
  base: Record<AbilityKey, number>
  bonus: Record<AbilityKey, number>
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
 * 顺序：按方式取基础值 -> 加种族/专长的每级加成（矮人刚毅、强健身心等）。
 * 手动模式直接采用用户填写的数值，不再叠加任何加成。
 */
export function deriveHp(
  c: CharacterChoices,
  cls: ClassData | null | undefined,
  spTraits: TraitEntry[],
  conMod: number
): { max: number; hitDie: number; bonusPerLevel: number; source: string } {
  const hitDie = cls?.hitDie ?? 8
  const level = c.level

  // 每级额外生命值：矮人刚毅（生命值上限加1/级）、强健身心 Tough（+2/级）
  let bonusPerLevel = 0
  if (spTraits.some(t => /生命值上限加1/.test(t.desc))) bonusPerLevel += 1
  const tough = Object.values(c.feats).some(f => /强健身心|Tough/i.test(f.name))
  if (tough) bonusPerLevel += 2

  if (c.hpMethod === 'manual' && c.hpManual != null) {
    return { max: Math.max(1, c.hpManual), hitDie, bonusPerLevel, source: '手动指定' }
  }
  const base =
    c.hpMethod === 'roll'
      ? rolledHp(hitDie, level, conMod, c.hpRolls)
      : averageHp(hitDie, level, conMod)
  return {
    max: base + bonusPerLevel * level,
    hitDie,
    bonusPerLevel,
    source: c.hpMethod === 'roll' ? '逐级投骰' : '固定平均值',
  }
}

// ---------- 专长槽位（按 5R 升级规则从职业等级表推导） ----------

export interface FeatSlot {
  key: string // choices.feats 的键
  label: string
  kind: 'general' | 'style' | 'epic'
}

/**
 * 从职业等级表推导当前等级的专长槽位：
 * - 表中「属性值提升」的等级（4/8/12/16，战士额外 6/14）-> 通用专长槽（可选属性值提升）
 * - 「战斗风格」特性 -> 战斗风格专长槽
 * - 「传奇恩惠」（19级）-> 传奇恩惠专长槽
 * 起源专长来自背景，不在此列。
 */
export function featSlots(cls: ClassData | null, level: number): FeatSlot[] {
  if (!cls) return []
  const out: FeatSlot[] = []
  let hasStyle = false
  for (const row of cls.levels) {
    if (row.level > level) break
    const fs = row.features.join(' ')
    if (!hasStyle && /战斗风格/.test(fs)) {
      hasStyle = true
      out.push({ key: 'style', label: `战斗风格（${row.level}级职业特性）`, kind: 'style' })
    }
    if (/属性值提升/.test(fs)) {
      out.push({ key: `lv${row.level}`, label: `${row.level}级 · 属性值提升或通用专长`, kind: 'general' })
    }
    if (/传奇恩惠/.test(fs)) {
      out.push({ key: `lv${row.level}epic`, label: `${row.level}级 · 传奇恩惠`, kind: 'epic' })
    }
  }
  // 等级表缺失/未解析出提升行时退回标准 4/8/12/16（19 传奇恩惠）
  if (!out.some(s => s.kind === 'general')) {
    for (const lv of [4, 8, 12, 16]) {
      if (lv <= level) out.push({ key: `lv${lv}`, label: `${lv}级 · 属性值提升或通用专长`, kind: 'general' })
    }
  }
  if (level >= 19 && !out.some(s => s.kind === 'epic')) {
    out.push({ key: 'lv19epic', label: '19级 · 传奇恩惠', kind: 'epic' })
  }
  return out
}

export function deriveAbilities(c: CharacterChoices, bg: BackgroundData | null): DerivedAbilities {
  const base = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, c.baseScores[k] ?? 10])
  ) as Record<AbilityKey, number>

  const bonus = Object.fromEntries(ABILITY_KEYS.map(k => [k, 0])) as Record<AbilityKey, number>
  if (bg && bg.abilities.length > 0) {
    if (c.bgBonusMode === '1+1+1') {
      for (const k of bg.abilities) bonus[k] += 1
    } else {
      const { plus2, plus1 } = effectiveBgChoice(c, bg)
      if (plus2) bonus[plus2] += 2
      if (plus1 && plus1 !== plus2) bonus[plus1] += 1
    }
  }

  const total = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, Math.min(20, base[k] + bonus[k])])
  ) as Record<AbilityKey, number>
  const mods = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, abilityMod(total[k])])
  ) as Record<AbilityKey, number>
  return { base, bonus, total, mods }
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

  const ab = deriveAbilities(c, loaded.background)
  const pb = proficiencyBonus(c.level)
  const level = c.level
  // 共通特质 + 所选亚种特质
  const spTraits = speciesTraits(species, c.subraceChoice)

  // ---- 生命值 / 护甲 ----
  const hpInfo = deriveHp(c, cls, spTraits, ab.mods.CON)
  const hitDie = hpInfo.hitDie
  const hp = hpInfo.max

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

  const profSkills = new Set<SkillKey>([...(bg?.skills ?? []), ...c.classSkills])
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
  for (const slot of featSlots(cls ?? null, level)) {
    const f = c.feats[slot.key]
    if (!f) continue
    const tag =
      slot.kind === 'style' ? '战斗风格' :
      slot.kind === 'epic' ? '传奇恩惠' :
      `${slot.key.slice(2)}级专长`
    specials.push({ name: `【${tag}】${f.name}`, desc: f.desc })
  }
  const feats = gainedFeatures(cls, level)
  if (feats.length) {
    const byLevel = new Map<number, string[]>()
    for (const f of feats) {
      byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f.name])
    }
    const lines = [...byLevel.entries()].map(([lv, names]) => `${lv}级：${names.join('、')}`)
    specials.push({
      name: `【职业特性】${cls!.nameCn}`,
      desc: lines.join('\n'),
    })
  }
  if (sub) {
    for (const f of sub.features) {
      if (subclassFeatureLevel(f.name) <= level) {
        specials.push({ name: `【子职·${sub.nameCn}】${f.name}`, desc: f.desc })
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
  const row = classLevelRow(cls, level)
  const spellSlots: SpellSlots[] = []
  if (row?.slots) {
    for (const [lv, count] of Object.entries(row.slots)) {
      spellSlots.push({
        level: parseInt(lv, 10),
        limit: { name: `${lv}环法术位`, uses: count as number, resets: ['长休'] },
      })
    }
  }
  if (row?.pactSlots && row.pactSlots.count > 0) {
    spellSlots.push({
      level: row.pactSlots.level,
      limit: { name: '魔契法术位', uses: row.pactSlots.count, resets: ['短休', '长休'] },
    })
  }
  let spellDc: string | null = null
  let spellAttack: string | null = null
  if (cls?.spellAbility && spellSlots.length > 0) {
    const m = ab.mods[cls.spellAbility]
    spellDc = `${8 + pb + m}（${ABILITY_CN[cls.spellAbility]}）`
    spellAttack = fmtMod(pb + m)
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
  if (cls) aboutParts.push(`职业：${cls.nameCn} ${cls.nameEn} ${level}级${sub ? `（${sub.nameCn}）` : ''}`)
  if (bg) aboutParts.push(`背景：${bg.nameCn} ${bg.nameEn}`)
  if (c.about.trim()) aboutParts.push(c.about.trim())

  const sizeCn = c.sizeChoice || species?.sizeOptions[0] || '中型'

  return {
    name: c.name || '未命名冒险者',
    about: aboutParts.join('；') || null,
    size: SIZE_CN_TO_EN[sizeCn] ?? 'Medium',
    type: 'humanoid',
    subtype: species ? `${species.nameCn} ${species.nameEn}`.trim() : null,
    group: cls ? `${cls.nameCn} ${level}级` : null,
    alignment: c.alignment,
    armor_class: { value: acValue, special: acSpecial },
    hp: { value: hp, hit_dice: cls ? `${level}d${hitDie}` : null },
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
