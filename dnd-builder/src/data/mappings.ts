import type { AbilityKey, SkillKey } from '../types'

export const ABILITY_KEYS: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

export const ABILITY_CN: Record<AbilityKey, string> = {
  STR: '力量',
  DEX: '敏捷',
  CON: '体质',
  INT: '智力',
  WIS: '感知',
  CHA: '魅力',
}

export const ABILITY_FULL_EN: Record<AbilityKey, string> = {
  STR: 'strength',
  DEX: 'dexterity',
  CON: 'constitution',
  INT: 'intelligence',
  WIS: 'wisdom',
  CHA: 'charisma',
}

export function cnToAbility(text: string): AbilityKey | null {
  for (const k of ABILITY_KEYS) {
    if (text.includes(ABILITY_CN[k])) return k
  }
  return null
}

export function cnToAbilities(text: string): AbilityKey[] {
  const out: AbilityKey[] = []
  // 按出现位置排序，保持原文顺序
  const found: { k: AbilityKey; i: number }[] = []
  for (const k of ABILITY_KEYS) {
    const i = text.indexOf(ABILITY_CN[k])
    if (i >= 0) found.push({ k, i })
  }
  found.sort((a, b) => a.i - b.i)
  for (const f of found) out.push(f.k)
  return out
}

// 技能：2024 译名 + 常见旧译名别名
export const SKILL_ALIASES: Record<SkillKey, string[]> = {
  acrobatics: ['特技', '体操', '杂技'],
  animal_handling: ['驯兽', '驯养动物', '动物驯养'],
  arcana: ['奥秘'],
  athletics: ['运动'],
  deception: ['欺瞒', '欺诈', '欺骗'],
  history: ['历史'],
  insight: ['洞悉', '洞察'],
  intimidation: ['威吓'],
  investigation: ['调查'],
  medicine: ['医药', '医疗', '医术'],
  nature: ['自然'],
  perception: ['察觉', '观察', '侦查'],
  performance: ['表演'],
  persuasion: ['游说', '说服'],
  religion: ['宗教'],
  sleight_of_hand: ['巧手', '手上功夫'],
  stealth: ['隐匿', '潜行', '隐秘'],
  survival: ['求生', '生存'],
}

export const SKILL_KEYS = Object.keys(SKILL_ALIASES) as SkillKey[]

export const SKILL_CN: Record<SkillKey, string> = Object.fromEntries(
  SKILL_KEYS.map(k => [k, SKILL_ALIASES[k][0]])
) as Record<SkillKey, string>

export const SKILL_ABILITY: Record<SkillKey, AbilityKey> = {
  acrobatics: 'DEX',
  animal_handling: 'WIS',
  arcana: 'INT',
  athletics: 'STR',
  deception: 'CHA',
  history: 'INT',
  insight: 'WIS',
  intimidation: 'CHA',
  investigation: 'INT',
  medicine: 'WIS',
  nature: 'INT',
  perception: 'WIS',
  performance: 'CHA',
  persuasion: 'CHA',
  religion: 'INT',
  sleight_of_hand: 'DEX',
  stealth: 'DEX',
  survival: 'WIS',
}

export function cnToSkill(text: string): SkillKey | null {
  const t = text.trim()
  for (const k of SKILL_KEYS) {
    for (const alias of SKILL_ALIASES[k]) {
      if (t === alias) return k
    }
  }
  // 退一步做包含匹配（按别名长度降序，避免误匹配）
  const pairs: { k: SkillKey; a: string }[] = []
  for (const k of SKILL_KEYS) for (const a of SKILL_ALIASES[k]) pairs.push({ k, a })
  pairs.sort((x, y) => y.a.length - x.a.length)
  for (const p of pairs) {
    if (t.includes(p.a)) return p.k
  }
  return null
}

export function cnTextToSkills(text: string): SkillKey[] {
  // 从一段文字中按出现顺序抽取全部技能
  const found: { k: SkillKey; i: number }[] = []
  for (const k of SKILL_KEYS) {
    let best = -1
    for (const a of SKILL_ALIASES[k]) {
      const i = text.indexOf(a)
      if (i >= 0 && (best < 0 || i < best)) best = i
    }
    if (best >= 0) found.push({ k, i: best })
  }
  found.sort((a, b) => a.i - b.i)
  return found.map(f => f.k)
}

export const SIZE_CN_TO_EN: Record<string, string> = {
  超巨型: 'Gargantuan',
  巨型: 'Huge',
  大型: 'Large',
  中型: 'Medium',
  小型: 'Small',
  微型: 'Tiny',
}

export const CREATURE_TYPE_CN_TO_EN: Record<string, string> = {
  类人: 'humanoid',
  类人生物: 'humanoid',
}

export const ALIGNMENTS = [
  '守序善良', '中立善良', '混乱善良',
  '守序中立', '绝对中立', '混乱中立',
  '守序邪恶', '中立邪恶', '混乱邪恶',
]

export const STANDARD_LANGUAGES = [
  '通用语', '矮人语', '精灵语', '巨人语', '侏儒语',
  '哥布林语', '半身人语', '兽人语', '龙语',
]

/** 稀有语言（2024 玩家手册）：名称 + 典型使用者起源 */
export const RARE_LANGUAGES: { name: string; origin: string }[] = [
  { name: '深渊语Abyssal', origin: '深渊的恶魔' },
  { name: '天界语Celestial', origin: '天族' },
  { name: '深潜语Deep Speech', origin: '异怪' },
  { name: '德鲁伊语Druidic', origin: '德鲁伊结社' },
  { name: '炼狱语Infernal', origin: '九狱的魔鬼' },
  { name: '原初语Primordial', origin: '元素' },
  { name: '木族语Sylvan', origin: '妖精荒野' },
  { name: "盗贼黑话Thieves' Cant", origin: '各种犯罪公会' },
  { name: '地底通用语Undercommon', origin: '幽暗地域' },
]

export const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

export function parseCnInt(s: string): number | null {
  const m = s.match(/\d+/)
  if (m) return parseInt(m[0], 10)
  for (const [cn, n] of Object.entries(CN_NUM)) {
    if (s.includes(cn)) return n
  }
  return null
}

// ---------- 特质/专长中的属性加值 ----------

/**
 * 一个待分配的加值槽位。options 为空表示「任意属性」，
 * 否则只能在给定的几项里选（如「你的力量或敏捷提升1」）。
 */
export interface AbilityChoice {
  amount: number
  options: AbilityKey[]
}

/**
 * 属性加值规格。
 * fixed   —— 已指明属性，直接生效
 * schemes —— 待分配方案；多于一套时是「或者」并列的替代方案，由用户选其一
 *            （如「一项属性提升2，或者两项属性各提升1」）
 */
export interface AbilityBonusSpec {
  fixed: Partial<Record<AbilityKey, number>>
  schemes: AbilityChoice[][]
}

const CN_SMALL: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
const AB_ENTRIES = Object.entries(ABILITY_CN) as [AbilityKey, string][]
const AB_ALT = AB_ENTRIES.map(([, cn]) => cn).join('|')
const RAISE = '(?:增加|提升|加|\\+)'

function cnToKey(cn: string): AbilityKey | undefined {
  return AB_ENTRIES.find(([, v]) => v === cn.trim())?.[0]
}

/** 解析单套方案（已按「或者」切开） */
function parseScheme(text: string): { fixed: Partial<Record<AbilityKey, number>>; choices: AbilityChoice[] } {
  const fixed: Partial<Record<AbilityKey, number>> = {}
  const choices: AbilityChoice[] = []
  let t = text

  // 1) 限定多选一：「力量或敏捷提升1」「智力、感知或魅力提升1点」
  //    必须先于固定值匹配，否则「力量或敏捷提升1」会被当成敏捷+1。
  const multi = new RegExp(`((?:${AB_ALT})(?:\\s*[、,，或]\\s*(?:${AB_ALT}))+)\\s*(?:值)?\\s*${RAISE}\\s*(\\d+)`, 'g')
  const spans: [number, number][] = []
  let m: RegExpExecArray | null
  while ((m = multi.exec(t))) {
    const opts = m[1].split(/[、,，或]/).map(cnToKey).filter((k): k is AbilityKey => !!k)
    if (opts.length >= 2) {
      choices.push({ amount: parseInt(m[2], 10), options: opts })
      spans.push([m.index, m.index + m[0].length])
    }
  }
  // 掩蔽已识别片段，避免其中的属性名再被当作固定加值
  for (const [a, b] of spans.reverse()) t = t.slice(0, a) + ' '.repeat(b - a) + t.slice(b)

  // 2) 固定：「你的智力增加2点」「体质加2，感知加1」
  for (const [key, cn] of AB_ENTRIES) {
    const re = new RegExp(`${cn}\\s*(?:值)?\\s*${RAISE}\\s*(\\d+)`, 'g')
    while ((m = re.exec(t))) fixed[key] = (fixed[key] ?? 0) + parseInt(m[1], 10)
  }

  // 3) 任意属性槽位：「一项属性提升2」+「另一项属性提升1」
  const seq = new RegExp(`(?:另(?:外)?)?一项(?:不同的)?属性(?:值)?${RAISE}\\s*(\\d+)`, 'g')
  while ((m = seq.exec(t))) choices.push({ amount: parseInt(m[1], 10), options: [] })

  // 4) 任意属性并列：「两项属性各提升1」「三项不同的属性各自加1」
  if (!choices.some(c => c.options.length === 0)) {
    const many = t.match(new RegExp(`([一二两三四五六\\d]+)项(?:不同的)?属性(?:值)?各(?:自)?${RAISE}\\s*(\\d+)`))
    if (many) {
      const n = CN_SMALL[many[1]] ?? (parseInt(many[1], 10) || 0)
      const amt = parseInt(many[2], 10)
      for (let i = 0; i < n; i++) choices.push({ amount: amt, options: [] })
    }
  }
  return { fixed, choices }
}

/**
 * 从特质/专长文本里解析属性加值。
 * 2024 规则的种族不给加值（来自背景），但 2014/第三方种族与大量专长会给。
 */
export function parseAbilityBonus(text: string): AbilityBonusSpec {
  const spec: AbilityBonusSpec = { fixed: {}, schemes: [] }
  if (!text) return spec
  const t = text.replace(/\s+/g, '')

  // 「或者」分隔的是并列可选方案，分别解析后由用户择一
  const parts = t.split('或者').filter(Boolean)
  for (const part of parts) {
    const { fixed, choices } = parseScheme(part)
    // 固定值不随方案变化，合并到顶层
    for (const [k, v] of Object.entries(fixed) as [AbilityKey, number][]) {
      spec.fixed[k] = Math.max(spec.fixed[k] ?? 0, v)
    }
    if (choices.length) spec.schemes.push(choices)
  }
  return spec
}

/** 合并多条来源的加值（固定值相加；待分配方案各自保留） */
export function mergeAbilityBonus(specs: AbilityBonusSpec[]): AbilityBonusSpec {
  const out: AbilityBonusSpec = { fixed: {}, schemes: [] }
  for (const s of specs) {
    for (const [k, v] of Object.entries(s.fixed) as [AbilityKey, number][]) {
      out.fixed[k] = (out.fixed[k] ?? 0) + v
    }
    out.schemes.push(...s.schemes)
  }
  return out
}
