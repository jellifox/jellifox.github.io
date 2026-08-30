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
const SKILL_ALIASES: Record<SkillKey, string[]> = {
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
