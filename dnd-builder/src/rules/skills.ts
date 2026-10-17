// 自选技能熟练与专精：从种族特质、专长原文里识别「自选一项技能熟练」「X、Y或Z之一」，
// 以及职业特性（专精、熟练探险家、学者）与专长给出的专精名额。

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
export function skillChoicesIn(desc: string): { count: number; options: SkillKey[] | null }[] {
  const out: { count: number; options: SkillKey[] | null }[] = []
  for (const line of desc.split('\n')) {
    if (!/技能/.test(line) || !/熟练/.test(line) || !/自选|之一|选择/.test(line)) continue
    // 「选择一个拥有其熟练但不具备相应专精的技能」是专精，不是熟练
    if (/拥有其熟练但/.test(line)) continue
    const n = line.match(/(?:共计)?([一两二三四])(?:项|个|种)/)
    const opts = skillsMentioned(line)
    out.push({ count: n ? CN_NUM[n[1]] : 1, options: opts.length >= 2 ? opts : null })
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

/** 已生效的自选技能（只认选项内、未超额的） */
export function pickedSkills(choices: SkillChoice[], picks: Record<string, SkillKey[]> | undefined): SkillKey[] {
  return choices.flatMap(ch =>
    (picks?.[ch.key] ?? []).filter(s => !ch.options || ch.options.includes(s)).slice(0, ch.count)
  )
}

/** 专精名额：职业特性 + 专长 */
export function expertiseSources(
  instances: ClassInstance[],
  feats: TraitEntry[]
): { source: string; count: number }[] {
  const out: { source: string; count: number }[] = []
  for (const inst of instances) {
    for (const f of gainedFeatures(inst.cls, inst.level)) {
      const n = f.name === '专精' ? 2 : /熟练探险家|^学者$/.test(f.name) ? 1 : 0
      if (n) out.push({ source: `${inst.cls.nameCn}${f.level}级·${f.name}`, count: n })
    }
  }
  for (const f of feats) {
    if (/拥有其熟练但不具备相应\s*专精/.test(f.desc)) out.push({ source: f.name, count: 1 })
  }
  return out
}
