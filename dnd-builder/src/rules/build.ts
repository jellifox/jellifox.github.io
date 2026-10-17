// 角色规则的基础构件：属性值、生命值、专长槽位、种族特质/亚种、属性加值分配。
// 完整角色由 character.ts 的 deriveCharacter 组装，statblock.ts / mianbuan.ts 只做序列化。

import { subclassFeatureLevel } from '../data/parsers'
import type {
  AbilityKey, BackgroundData, CharacterChoices, ClassData, LoadedEntities,
  SpeciesData, TraitEntry,
} from '../types'
import {
  ABILITY_KEYS, mergeAbilityBonus, parseAbilityBonus, type AbilityBonusSpec,
} from '../data/mappings'
import { abilityMod, hpPerLevelAverage } from './rules'
import { classInstances, hitDieSequence } from './multiclass'

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
): { max: number; hitDie: number; dice: number[]; bonusPerLevel: number; featureNotes: string[]; source: string } {
  const instances = classInstances(c, loaded)
  const seq = hitDieSequence(instances)
  const hitDie = seq[0] ?? 8
  // 职业尚未加载时按 d8 占位，保证有结果
  const dice = seq.length ? seq : Array.from({ length: c.level }, () => 8)

  // 每级额外生命值：矮人刚毅（生命值上限加1/级）、强健身心 Tough（+2/级）
  let bonusPerLevel = 0
  if (spTraits.some(t => /生命值上限加1/.test(t.desc))) bonusPerLevel += 1
  if (Object.values(activeFeats(c, loaded)).some(f => /强健身心|Tough/i.test(f.name))) bonusPerLevel += 2

  // 子职的生命值上限加成。龙族体魄：「生命值上限提升3，此后每提升一个术士等级，都将再次提升1」
  // = 3 + (职业等级 − 3)；2014 版「增加1，并且每当你获得一个术士等级时再增加1」同理
  let featureBonus = 0
  const featureNotes: string[] = []
  for (const i of instances) {
    for (const f of i.subclass?.features ?? []) {
      const lv = subclassFeatureLevel(f.name)
      const m = f.desc.match(/生命值(?:上限|最大值)(?:提升|增加)\s*(\d+)[^。]*?。?[^。]{0,4}?(?:此后|之后|每当)[^。]{0,14}?等级[^。]{0,12}?(?:提升|增加)\s*1/)
      if (!m || lv > i.level) continue
      const n = +m[1] + (i.level - lv)
      featureBonus += n
      featureNotes.push(`${f.name.replace(/^\d+\s*级\s*[：:]/, '').replace(/\s*[A-Za-z].*$/, '')} +${n}`)
    }
  }

  if (c.hpMethod === 'manual' && c.hpManual != null) {
    return { max: Math.max(1, c.hpManual), hitDie, dice, bonusPerLevel, featureNotes: [], source: '手动指定' }
  }
  let base = dice[0] + conMod
  for (let i = 1; i < dice.length; i++) {
    const r = c.hpMethod === 'roll'
      ? (c.hpRolls[i - 1] ?? hpPerLevelAverage(dice[i]))
      : hpPerLevelAverage(dice[i])
    base += r + conMod
  }
  return {
    max: Math.max(dice.length, base) + bonusPerLevel * dice.length + featureBonus,
    hitDie,
    dice,
    bonusPerLevel,
    featureNotes,
    source: c.hpMethod === 'roll' ? '逐级投骰' : '固定平均值',
  }
}

// ---------- 专长槽位（按 5R 升级规则从职业等级表推导） ----------

export interface FeatSlot {
  key: string // choices.feats 的键（兼职职业带 'mc:<classUrl>:' 前缀）
  label: string
  kind: 'general' | 'style' | 'epic' | 'origin'
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
  const out = inst.flatMap(i => featSlots(i.cls, i.level, i.keyPrefix, tag ? `${i.cls.nameCn}` : ''))
  // 种族给的额外起源专长（人类「多才多艺：你获得一项自选的起源专长」）
  const versatile = speciesTraits(loaded.species ?? undefined, c.subraceChoice)
    .find(t => /获得一[项个](?:自选的?)?起源专长/.test(t.desc))
  if (versatile) {
    out.unshift({ key: 'species-origin', label: `种族·${versatile.name.replace(/[A-Za-z\s]+$/, '')} · 起源专长`, kind: 'origin', level: 1 })
  }
  return out
}

/**
 * 当前仍生效的专长：起源专长（有背景时）+ 仍存在的升级槽位里的专长。
 * choices.feats 会残留已消失槽位的专长（降级、换职业、移除兼职后），
 * 所有计算都必须经由本函数，否则这些专长仍会加属性、加生命值、给法术。
 */
export function activeFeats(c: CharacterChoices, loaded: LoadedEntities): Record<string, TraitEntry> {
  const live = new Set(allFeatSlots(c, loaded).map(s => s.key))
  const out: Record<string, TraitEntry> = {}
  for (const [k, v] of Object.entries(c.feats)) {
    if (k === 'origin' ? !!loaded.background?.feat : live.has(k)) out[k] = v
  }
  return out
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
  // 槽位标签取自 allFeatSlots，兼职职业的键带 'mc:<classUrl>:' 前缀，不能再靠解析键名
  const labels = new Map(allFeatSlots(c, loaded).map(sl => [sl.key, sl.label.replace(/ · .*$/, '')]))
  const slotLabel = (k: string) =>
    k === 'origin' ? '起源专长' : labels.get(k) ?? '专长'
  for (const [slotKey, feat] of Object.entries(activeFeats(c, loaded))) {
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

  // 专长固定加值 + 所有待分配槽位 -> 成长栏。传奇恩惠单独累计：它允许突破 20，上限 30
  const epic = Object.fromEntries(ABILITY_KEYS.map(k => [k, 0])) as Record<AbilityKey, number>
  if (loaded) {
    const epicSlots = new Set(allFeatSlots(c, loaded).filter(sl => sl.kind === 'epic').map(sl => sl.key))
    for (const [slotKey, feat] of Object.entries(activeFeats(c, loaded))) {
      const into = epicSlots.has(slotKey) ? epic : growth
      for (const [k, v] of Object.entries(parseAbilityBonus(feat.desc).fixed) as [AbilityKey, number][]) {
        into[k] += v
      }
    }
    for (const pb of pendingBonuses(c, loaded)) {
      const k = c.abilityPicks[pb.key]
      if (!k) continue
      // 种族的自选加值属于创建时加值，专长的属于成长
      if (pb.key.startsWith('species')) bonus[k] += pb.amount
      else if (epicSlots.has(pb.key.replace(/^feat:/, '').replace(/:\d+$/, ''))) epic[k] += pb.amount
      else growth[k] += pb.amount
    }
  }

  // 2024 规则：种族/背景/专长的加值不能让属性超过 20（基础值本身不封顶，自定义模式可填更高），
  // 传奇恩惠的加值上限为 30。
  const total = Object.fromEntries(
    ABILITY_KEYS.map(k => {
      const capped = Math.max(base[k], Math.min(20, base[k] + bonus[k] + growth[k]))
      return [k, epic[k] > 0 ? Math.max(capped, Math.min(30, capped + epic[k])) : capped]
    })
  ) as Record<AbilityKey, number>
  for (const k of ABILITY_KEYS) growth[k] += epic[k]
  const mods = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, abilityMod(total[k])])
  ) as Record<AbilityKey, number>
  return { base, bonus, growth, total, mods }
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
