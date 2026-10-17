// 自选技能熟练与专精：从种族特质、专长原文里识别「自选一项技能熟练」「X、Y或Z之一」，
// 以及职业特性（专精、熟练探险家、学者）与专长给出的专精名额。
// 另含背景工具的具体选择与特性赋予的语言。

import type { CharacterChoices, LoadedEntities, SkillKey, TraitEntry } from '../types'
import { SKILL_ALIASES, SKILL_KEYS } from '../data/mappings'
import { activeFeats, allFeatSlots, gainedFeatures, speciesTraits } from './build'
import type { ClassInstance } from './multiclass'

export interface SkillChoice {
  /** choices.skillPicks 的键 */
  key: string
  source: string
  count: number
  /** null = 任意技能 */
  options: SkillKey[] | null
  /** 「如果你已有熟练，则你获得其专精」：选已熟练的技能时改为获得专精 */
  upgrade: boolean
}

const CN_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4 }

/** 原文里出现的技能名（按别名长度降序匹配，避免「察觉」误中「洞察」之类） */
function skillsMentioned(line: string): SkillKey[] {
  const out: SkillKey[] = []
  for (const k of SKILL_KEYS) {
    if (SKILL_ALIASES[k].some(a => a.length >= 2 && line.includes(a))) out.push(k)
  }
  return out
}

/** 一段描述里的自选技能熟练（逐行判断，专长的每条增益是一行） */
export function skillChoicesIn(desc: string): Omit<SkillChoice, 'key' | 'source'>[] {
  const out: Omit<SkillChoice, 'key' | 'source'>[] = []
  for (const line of desc.split('\n')) {
    if (!/技能/.test(line) || !/熟练/.test(line) || !/自选|之一|选择/.test(line)) continue
    // 「选择一个拥有其熟练但不具备相应专精的技能」是专精，不是熟练
    if (/拥有其熟练但/.test(line)) continue
    const n = line.match(/(?:共计)?([一两二三四])(?:项|个|种)/)
    const opts = skillsMentioned(line)
    out.push({
      count: n ? CN_NUM[n[1]] : 1,
      options: opts.length >= 2 ? opts : null,
      upgrade: /已有熟练[^。]*专精/.test(line),
    })
  }
  return out
}

function featLabels(c: CharacterChoices, loaded: LoadedEntities) {
  const labels = new Map(allFeatSlots(c, loaded).map(sl => [sl.key, sl.label.replace(/ · .*$/, '')]))
  return (k: string) => (k === 'origin' ? '起源专长' : labels.get(k) ?? '专长')
}

export function skillChoices(c: CharacterChoices, loaded: LoadedEntities): SkillChoice[] {
  const out: SkillChoice[] = []
  const push = (prefix: string, source: string, desc: string) =>
    skillChoicesIn(desc).forEach((ch, i) => out.push({ key: `${prefix}:${i}`, source, ...ch }))
  for (const t of speciesTraits(loaded.species ?? undefined, c.subraceChoice)) {
    push(`sp:${t.name}`, `种族·${t.name}`, t.desc)
  }
  const label = featLabels(c, loaded)
  for (const [k, f] of Object.entries(activeFeats(c, loaded))) {
    push(`feat:${k}`, `${label(k)}·${f.name}`, f.desc)
  }
  return out
}

/** 某个自选项里生效的选择（只认选项内、未超额的） */
export function validPicks(ch: SkillChoice, picks: Record<string, SkillKey[]> | undefined): SkillKey[] {
  return (picks?.[ch.key] ?? []).filter(s => !ch.options || ch.options.includes(s)).slice(0, ch.count)
}

/**
 * 应用自选技能。base = 其他来源已有的熟练。
 * 带 upgrade 的自选项（轶闻知识等）选到已熟练技能时给专精而非熟练。
 */
export function applySkillPicks(
  choices: SkillChoice[],
  picks: Record<string, SkillKey[]> | undefined,
  base: Set<SkillKey>
): { proficient: SkillKey[]; expertise: SkillKey[] } {
  const proficient: SkillKey[] = []
  const expertise: SkillKey[] = []
  // 先处理普通自选，再处理 upgrade 项，这样「先熟练再专精」的组合也能成立
  for (const ch of [...choices.filter(c => !c.upgrade), ...choices.filter(c => c.upgrade)]) {
    for (const s of validPicks(ch, picks)) {
      if (ch.upgrade && (base.has(s) || proficient.includes(s))) expertise.push(s)
      else proficient.push(s)
    }
  }
  return { proficient, expertise }
}

export interface ExpertiseSource {
  /** choices.expertisePicks 的键 */
  key: string
  source: string
  count: number
  /** null = 任一已熟练技能 */
  options: SkillKey[] | null
}

/** 法师「学者」限定的学术技能 */
const SCHOLAR_SKILLS: SkillKey[] = ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion']

/** 专精名额：职业特性（专精 2、熟练探险家 1、学者 1 限学术技能）+ 专长（技艺专家等） */
export function expertiseSources(
  instances: ClassInstance[],
  feats: Record<string, TraitEntry>
): ExpertiseSource[] {
  const out: ExpertiseSource[] = []
  for (const inst of instances) {
    for (const f of gainedFeatures(inst.cls, inst.level)) {
      const n = f.name === '专精' ? 2 : /熟练探险家|^学者$/.test(f.name) ? 1 : 0
      if (!n) continue
      out.push({
        key: `${inst.keyPrefix}lv${f.level}:${f.name}`,
        source: `${inst.cls.nameCn}${f.level}级·${f.name}`,
        count: n,
        options: f.name === '学者' ? SCHOLAR_SKILLS : null,
      })
    }
  }
  for (const [k, f] of Object.entries(feats)) {
    if (/拥有其熟练但不具备相应\s*专精/.test(f.desc)) {
      out.push({ key: `feat:${k}`, source: f.name, count: 1, options: null })
    }
  }
  return out
}

// ---------- 工具 ----------

/** 2024 玩家手册的工具变体（名称取自不全书「其他工具」「工匠工具」页） */
export const TOOL_GROUPS: Record<string, string[]> = {
  赌具: ['骰子', '龙棋', '纸牌', '三龙牌'],
  乐器: ['风笛', '鼓', '扬琴', '长笛', '号角', '鲁特琴', '里拉琴', '排箫', '芦笛', '提琴'],
  工匠工具: [
    '炼金工具', '酿酒工具', '书法工具', '木匠工具', '制图工具', '鞋匠工具', '厨师工具', '玻璃匠工具',
    '珠宝匠工具', '皮匠工具', '石匠工具', '画家工具', '陶匠工具', '铁匠工具', '修补工具', '织布工具', '木雕工具',
  ],
}

/** 背景工具若是「选择一种赌具」之类，返回可选项；固定工具返回 null */
export function toolOptions(text: string): string[] | null {
  if (!/选择|任选|自选|一种/.test(text)) return null
  const opts = Object.entries(TOOL_GROUPS).filter(([g]) => text.includes(g)).flatMap(([, v]) => v)
  return opts.length ? opts : null
}

// ---------- 语言 ----------

/** 2024：通用语 + 自选 2 种 */
export const LANGUAGE_PICKS = 2

/** 自选语言名额：基础 2 种 + 游侠「熟练探险家」2 种 */
export function languagePicks(featureNames: string[]): number {
  return LANGUAGE_PICKS + (featureNames.includes('熟练探险家') ? 2 : 0)
}

const LANG_TOKEN = /(?:^|[、，,和写及与：:\s解])([\u4e00-\u9fa5]{1,4}?语)(?=[（(、，,。和及与\s]|$)/g

/** 种族「语言」段与职业特性（盗贼黑话、德鲁伊语）直接给的语言 */
export function grantedLanguages(languageText: string, featureNames: string[], known: string[]): string[] {
  const out: string[] = []
  const add = (raw: string) => {
    // 对齐到语言表里的完整名称（「德鲁伊语」→「德鲁伊语Druidic」）
    const name = known.find(k => k.startsWith(raw)) ?? raw
    if (!out.includes(name)) out.push(name)
  }
  for (const sentence of languageText.split(/[。\n]/)) {
    const understandOnly = /理解/.test(sentence) && /不能说|无法说/.test(sentence)
    for (const m of sentence.matchAll(LANG_TOKEN)) {
      // 「说、读、写鸟族语」：去掉粘在前面的动词
      add(m[1].replace(/^[说读写懂会]+/, '') + (understandOnly ? '（仅理解）' : ''))
    }
  }
  if (featureNames.includes('盗贼黑话')) add('盗贼黑话')
  if (featureNames.includes('德鲁伊语')) add('德鲁伊语')
  return out
}
