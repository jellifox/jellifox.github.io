// 兼职（Multiclassing），按玩家手册2024「兼职」章节实现。
//
// 等级约定：choices.level 是角色总等级；起始职业等级 = 总等级 − Σ兼职等级。
// 只有熟练加值、戏法强化、种族法术这类「按总等级」的东西直接用 choices.level，
// 其余（职业特性、子职特性、专长槽位、生命骰、法术位）都要按各职业自己的等级算，
// 因此一律经由 classInstances() 取得。

import type {
  AbilityKey, CharacterChoices, ClassData, LoadedEntities, SkillKey, SpellEntry, SubclassData,
} from '../types'
import { ABILITY_CN } from '../data/mappings'

/** 一个职业实例：起始职业或某个兼职 */
export interface ClassInstance {
  /**
   * 专长槽位等键的前缀：起始职业为 ''（兼容旧存档），兼职为 'mc:<classUrl>:'。
   * 每个职业在角色中唯一，以 url 作键稳定，增删其他兼职不会让键错位。
   */
  keyPrefix: string
  index: number // -1 = 起始职业；0.. = 兼职序号
  cls: ClassData
  subclass: SubclassData | null
  level: number
  primary: boolean
}

export function multiclassLevelSum(c: CharacterChoices): number {
  return (c.multiclasses ?? []).reduce((n, m) => n + Math.max(0, m.level), 0)
}

/** 兼职职业名下各种键（专长槽位、属性分配、方案选择）的前缀 */
export function multiclassKeyPrefix(classUrl: string): string {
  return `mc:${classUrl}:`
}

/** 起始职业等级（至少 1） */
export function primaryClassLevel(c: CharacterChoices): number {
  return Math.max(1, c.level - multiclassLevelSum(c))
}

/** 起始职业 + 已加载的兼职，按「起始在前」排列；未加载完成的兼职暂不计入 */
export function classInstances(c: CharacterChoices, loaded: LoadedEntities): ClassInstance[] {
  const out: ClassInstance[] = []
  if (loaded.cls) {
    out.push({
      keyPrefix: '', index: -1, cls: loaded.cls, subclass: loaded.subclass,
      level: primaryClassLevel(c), primary: true,
    })
  }
  ;(c.multiclasses ?? []).forEach((m, i) => {
    const lm = loaded.multiclasses?.[m.classUrl]
    if (!lm?.cls || m.level <= 0) return
    out.push({
      keyPrefix: multiclassKeyPrefix(m.classUrl), index: i, cls: lm.cls, subclass: lm.subclass,
      level: m.level, primary: false,
    })
  })
  return out
}

/** 「术士4 / 圣武士1」 */
export function classSummary(instances: ClassInstance[]): string {
  return instances.map(i => `${i.cls.nameCn}${i.level}`).join(' / ')
}

// ---------- 先决 ----------

/**
 * 属性先决，合取范式：外层每一组都要满足，组内任一属性 ≥13 即可。
 * 「力量或敏捷，智力」-> [[STR, DEX], [INT]]
 */
export type Prereq = AbilityKey[][]

const AB_CN = Object.entries(ABILITY_CN) as [AbilityKey, string][]
const AND_SPLIT = /与|和|以及|并且|且|，|,|；|;/

export function parsePrereq(text: string): Prereq {
  const t = text.replace(/\s+/g, '').replace(/\d+/g, '').replace(/达到|至少|具有|必须|你/g, '')
  const groups: Prereq = []
  for (const part of t.split(AND_SPLIT)) {
    // 组内按出现顺序收集属性名（「或」「、」均视为任选）
    const found = AB_CN
      .map(([k, cn]) => ({ k, at: part.indexOf(cn) }))
      .filter(x => x.at !== -1)
      .sort((a, b) => a.at - b.at)
      .map(x => x.k)
    if (found.length) groups.push(found)
  }
  return groups
}

/**
 * 某职业的兼职先决。第三方职业（血猎手、邪狱使）在「作为兼职角色」段里明写了先决，
 * 且比其「主要属性」字段更完整（血猎手主要属性漏写了智力、邪狱使为空），故优先采用。
 */
export function prereqOf(cls: ClassData): Prereq {
  const mc = cls.multiclassText ?? ''
  const head = mc.split(/才能|。/)[0]
  if (/13/.test(head)) {
    const p = parsePrereq(head.replace(/^作为兼职角色/, ''))
    if (p.length) return p
  }
  return parsePrereq(cls.primaryAbility)
}

export function prereqLabel(p: Prereq): string {
  if (!p.length) return '无属性要求'
  return p.map(g => g.map(k => ABILITY_CN[k]).join('或') + ' ≥13').join('，且')
}

/** 返回未满足的组（空数组 = 满足） */
export function unmetPrereq(p: Prereq, totals: Record<AbilityKey, number>): Prereq {
  return p.filter(g => !g.some(k => totals[k] >= 13))
}

/**
 * 兼职一个新职业：新职业与「所有当前职业」的主要属性都要 ≥13。
 * 返回每个不满足的职业及其缺口，便于界面说明原因。
 */
export function multiclassBlockers(
  current: ClassData[],
  next: ClassData,
  totals: Record<AbilityKey, number>
): { cls: ClassData; unmet: Prereq }[] {
  return [...current, next]
    .map(cls => ({ cls, unmet: unmetPrereq(prereqOf(cls), totals) }))
    .filter(x => x.unmet.length > 0)
}

// ---------- 兼职熟练 ----------

export interface MulticlassProfs {
  weapons: string // 「军用武器」「军用远程武器」等，空串表示无
  light: boolean
  medium: boolean
  heavy: boolean
  shield: boolean
  /** 若该职业兼职时给一项技能：可选范围；null 表示不给 */
  skillChoices: SkillKey[] | 'any' | null
  tools: string
}

/** 解析「作为兼职角色」段：兼职时只获得这里列出的部分熟练 */
export function multiclassProfs(cls: ClassData): MulticlassProfs {
  // 只看「获得…以下能力/获得以下熟练」之后的部分，避免先决句里的词干扰
  const raw = cls.multiclassText ?? ''
  const i = raw.search(/以下能力|以下熟练|核心特质表(?:中|里)的/)
  const t = i === -1 ? raw : raw.slice(i)

  const weapons =
    /军用远程武器/.test(t) ? '军用远程武器' :
    /军用武器/.test(t) ? '军用武器' : ''

  let skillChoices: SkillKey[] | 'any' | null = null
  if (/技能/.test(t)) {
    // 「从游侠技能熟练栏选择一项」-> 本职业技能列表；「任选一项技能」-> 任意
    skillChoices = /任选/.test(t) && !/从.{0,6}技能/.test(t)
      ? 'any'
      : (cls.skillChoices === 'any' ? 'any' : cls.skillChoices)
  }

  const toolM = t.match(/(盗贼工具|修补工具|[^\s，、。]{0,6}乐器)/)
  return {
    weapons,
    light: /轻甲/.test(t),
    medium: /中甲|胸甲/.test(t),
    heavy: /重甲/.test(t),
    shield: /盾牌/.test(t),
    skillChoices,
    tools: toolM ? toolM[1].replace(/^任选一项/, '') : '',
  }
}

// ---------- 施法 ----------

export type CasterType = 'full' | 'half' | 'third' | 'pact' | 'none'

/** 子职给施法的三分之一施法者（奥法骑士、诡术师） */
const THIRD_CASTER_SUB = /奥法骑士|诡术师|Eldritch Knight|Arcane Trickster/

/** 子职名是否为三分之一施法者：它们用法师法术列表、以智力施法 */
export function isThirdCasterSubclass(name: string): boolean {
  return THIRD_CASTER_SUB.test(name)
}

/**
 * 该职业实例的施法属性。职业页写明的优先；三分之一施法者的职业（战士/游荡者）
 * 页面没有施法属性，按规则取智力。
 */
export function spellAbilityOf(inst: Pick<ClassInstance, 'cls' | 'subclass'>): AbilityKey | null {
  return inst.cls.spellAbility ?? (casterType(inst) === 'third' ? 'INT' : null)
}

/**
 * 判定施法进度。不硬编码职业名单（第三方职业也要能算），而是看该职业自身
 * 法术位表的最高环阶：9 环 = 全施法者，5 环 = 半施法者；有契约法术位 = 契约魔法。
 */
export function casterType(inst: Pick<ClassInstance, 'cls' | 'subclass'>): CasterType {
  const rows = inst.cls.levels
  if (rows.some(r => (r.pactSlots?.count ?? 0) > 0)) return 'pact'
  let maxRing = 0
  for (const r of rows) {
    for (const k of Object.keys(r.slots ?? {})) maxRing = Math.max(maxRing, parseInt(k, 10))
  }
  if (maxRing >= 6) return 'full'
  if (maxRing >= 1) return 'half'
  if (inst.subclass && THIRD_CASTER_SUB.test(inst.subclass.nameCn + inst.subclass.nameEn)) return 'third'
  return 'none'
}

/** 计入兼职施法者表的等级（规则：全额 / 一半向上取整 / 三分之一向下取整） */
export function casterLevelContribution(type: CasterType, level: number): number {
  switch (type) {
    case 'full': return level
    case 'half': return Math.ceil(level / 2)
    case 'third': return Math.floor(level / 3)
    default: return 0
  }
}

/** 玩家手册2024「兼职施法者：每环阶的法术位」，索引 = 施法者等级 */
const MULTICLASS_SLOTS: number[][] = [
  [],
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

export interface SlotResult {
  slots: Partial<Record<number, number>>
  pact: { count: number; level: number } | null
  /** single：仅一个职业有施法特性，按其本职业表；multi：按兼职施法者表 */
  mode: 'none' | 'single' | 'multi'
  casterLevel: number
}

/** 职业自身表格在某等级的法术位（施法特性未解锁时为空） */
function ownSlots(inst: ClassInstance): Partial<Record<number, number>> {
  return inst.cls.levels.find(r => r.level === inst.level)?.slots ?? {}
}

export function spellSlotsFor(instances: ClassInstance[]): SlotResult {
  // 契约魔法独立于施法特性，单独计算
  const warlock = instances.find(i => casterType(i) === 'pact')
  const pactRow = warlock?.cls.levels.find(r => r.level === warlock.level)
  const pact = pactRow?.pactSlots && pactRow.pactSlots.count > 0 ? pactRow.pactSlots : null

  // 「具有施法特性」：本职业表在其当前等级已有法术位，或三分之一施法者已达 3 级
  const casters = instances.filter(i => {
    const t = casterType(i)
    if (t === 'full' || t === 'half') return Object.keys(ownSlots(i)).length > 0
    if (t === 'third') return casterLevelContribution(t, i.level) > 0
    return false
  })

  if (casters.length === 0) return { slots: {}, pact, mode: 'none', casterLevel: 0 }
  let lv: number
  if (casters.length === 1) {
    // 规则：只从某一职业获得施法特性时，遵从该职业自身的规则
    const only = casters[0]
    const t = casterType(only)
    if (t !== 'third') {
      return { slots: ownSlots(only), pact, mode: 'single', casterLevel: casterLevelContribution(t, only.level) }
    }
    // 奥法骑士/诡术师的法术位表在子职页上，等价于施法者等级 ⌈等级/3⌉ 查表
    // （兼职时才按「三分之一向下取整」计入）。如 EK4 → 施法者等级 2 → 3 个一环位。
    lv = Math.ceil(only.level / 3)
  } else {
    lv = casters.reduce((n, i) => n + casterLevelContribution(casterType(i), i.level), 0)
  }
  lv = Math.min(20, lv)
  const slots: Partial<Record<number, number>> = {}
  ;(MULTICLASS_SLOTS[lv] ?? []).forEach((n, idx) => { if (n) slots[idx + 1] = n })
  return { slots, pact, mode: casters.length === 1 ? 'single' : 'multi', casterLevel: lv }
}

// ---------- 可准备的法术环阶 ----------

/**
 * 该职业在其当前等级能准备的最高法术环阶：0 = 只有戏法，-1 = 尚不能施法。
 * 规则：兼职时法术位可以合算，但「能准备什么环阶」仍按各职业自己的等级判断
 * （如游侠4/术士3 有三环法术位，却不能准备三环法术）。
 */
export function maxPreparableRing(inst: ClassInstance): number {
  const t = casterType(inst)
  const row = inst.cls.levels.find(r => r.level === inst.level)
  const hasCantrips = (row?.cantrips ?? 0) > 0
  if (t === 'pact') {
    return row?.pactSlots?.count ? row.pactSlots.level : hasCantrips ? 0 : -1
  }
  if (t === 'full' || t === 'half') {
    const rings = Object.keys(row?.slots ?? {}).map(Number)
    return rings.length ? Math.max(...rings) : hasCantrips ? 0 : -1
  }
  if (t === 'third') {
    // 奥法骑士/诡术师 3 级起施法；自身法术位表等价于施法者等级 ⌈等级/3⌉
    if (casterLevelContribution(t, inst.level) === 0) return -1
    return (MULTICLASS_SLOTS[Math.ceil(inst.level / 3)] ?? []).length
  }
  return -1
}

/** 法术速查里该职业的名称；三分之一施法者用法师法术列表 */
export function spellListClassName(inst: ClassInstance): string {
  return casterType(inst) === 'third' ? '法师' : inst.cls.nameCn.replace(/[（(].*$/, '').trim()
}

/**
 * 法术能否被当前角色准备：某个职业的法术列表含有它，且它的环阶不高于该职业的上限。
 * 职业名按包含关系匹配（与法术表加载时的筛选一致，如「奇械师EFA」对「奇械师」）。
 */
export function spellPreparable(spell: SpellEntry, instances: ClassInstance[]): boolean {
  return instances.some(inst => {
    const max = maxPreparableRing(inst)
    if (max < 0 || spell.ring > max) return false
    const n = spellListClassName(inst)
    return spell.classes.some(c => n.includes(c) || c.includes(n))
  })
}

// ---------- 生命骰 ----------

/**
 * 角色每一级对应的生命骰面数，按「起始职业在前、兼职依次在后」排列。
 * 第 0 项是 1 级（取最大值），其余按平均值或投骰。逐级投骰的结果按此顺序对应。
 */
export function hitDieSequence(instances: ClassInstance[]): number[] {
  const seq: number[] = []
  for (const i of instances) for (let n = 0; n < i.level; n++) seq.push(i.cls.hitDie)
  return seq
}

/** 「4d6 + 1d10」 */
export function hitDiceLabel(instances: ClassInstance[]): string {
  const byDie = new Map<number, number>()
  for (const i of instances) byDie.set(i.cls.hitDie, (byDie.get(i.cls.hitDie) ?? 0) + i.level)
  return [...byDie.entries()].sort((a, b) => b[0] - a[0]).map(([d, n]) => `${n}d${d}`).join(' + ')
}

// ---------- 熟练汇总 ----------

export interface ProficiencySummary {
  light: boolean
  medium: boolean
  heavy: boolean
  shield: boolean
  weapons: string // 「简易武器、军用武器」
  tools: string
}

/**
 * 起始职业的完整熟练 + 各兼职职业「作为兼职角色」所列的部分熟练。
 * 兼职不给豁免熟练（豁免只来自起始职业），这里也不涉及。
 */
export function proficiencySummary(instances: ClassInstance[]): ProficiencySummary {
  const out: ProficiencySummary = {
    light: false, medium: false, heavy: false, shield: false, weapons: '', tools: '',
  }
  const weapons = new Set<string>()
  const tools = new Set<string>()
  for (const i of instances) {
    if (i.primary) {
      const a = i.cls.armorTraining
      out.light ||= /轻甲/.test(a)
      out.medium ||= /中甲/.test(a)
      out.heavy ||= /重甲/.test(a)
      out.shield ||= /盾牌/.test(a)
      for (const w of i.cls.weaponProf.split(/[、，,和及与]/).map(x => x.trim()).filter(Boolean)) weapons.add(w)
    } else {
      const p = multiclassProfs(i.cls)
      out.light ||= p.light
      out.medium ||= p.medium
      out.heavy ||= p.heavy
      out.shield ||= p.shield
      if (p.weapons) weapons.add(p.weapons)
      if (p.tools) tools.add(p.tools)
    }
  }
  // 有了「军用武器」就不必再单列「军用远程武器」
  if (weapons.has('军用武器')) weapons.delete('军用远程武器')
  out.weapons = [...weapons].join('、')
  out.tools = [...tools].join('、')
  return out
}

/**
 * 戏法/准备法术名额：各职业按自己的等级取职业表（规则：法术准备按职业分别决定），再求和。
 * 没有任何职业给该项时为 null（不限）。
 */
export function spellQuotas(instances: ClassInstance[]) {
  const rows = instances
    .map(i => ({ i, row: i.cls.levels.find(r => r.level === i.level) }))
    .filter(x => x.row && (x.row.cantrips != null || x.row.preparedSpells != null))
  const sumOrNull = (vals: (number | undefined)[]) =>
    vals.some(v => v != null) ? vals.reduce<number>((n, v) => n + (v ?? 0), 0) : null
  return {
    rows,
    cantrips: sumOrNull(rows.map(x => x.row!.cantrips)),
    prepared: sumOrNull(rows.map(x => x.row!.preparedSpells)),
  }
}

/** 子职解锁等级：职业表里第一个「…子职」特性所在等级（缺省 3） */
export function subclassLevel(cls: ClassData): number {
  return cls.levels.find(r => r.features.some(f => /子职/.test(f)))?.level ?? 3
}
