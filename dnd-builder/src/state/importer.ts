// 导入角色：本工具的存档文件，或「DND面团角色卡」v4 存档。
// 面团存档是自由文本，只能按名称回查职业/子职/种族/背景，并把属性总值作为自定义基础值。

import type { BookIndex, IndexEntry } from '../data/toc'
import type { AbilityKey, CharacterChoices, MulticlassPick } from '../types'
import { WEAPONS } from '../rules/rules'
import { DEFAULT_CHOICES } from './draft'
import { SAVE_FORMAT, normalizeChoices } from './roster'

export interface ImportResult {
  choices: CharacterChoices
  /** 需要用户留意的地方（未匹配到的名称、需手动调整的数值） */
  notes: string[]
}

const MB_ABILITY: Record<string, AbilityKey> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }

/** 索引标题形如「术士 Sorcerer」「人类」；先前缀匹配再包含匹配 */
function findEntry<T extends IndexEntry>(entries: T[], name: string): T | undefined {
  const n = name.trim()
  if (!n) return undefined
  return entries.find(e => e.title.startsWith(n)) ?? entries.find(e => e.title.includes(n))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>

function fromMianbuan(state: { page1: Loose; page2?: Loose }, index: BookIndex): ImportResult {
  const p1 = state.page1
  const p2 = state.page2 ?? {}
  const notes: string[] = []
  const c: CharacterChoices = { ...DEFAULT_CHOICES, name: String(p1.charName ?? '') }

  // 职业：「术士 4级 圣武士 1级」；子职：「龙族术法 / 复仇之誓」
  const pairs = [...String(p1.charClass ?? '').matchAll(/([^\s\d/]+?)\s*(\d+)\s*级/g)]
    .map(m => ({ name: m[1], level: +m[2] }))
  const subs = String(p1.subclass ?? '').split(/\s*[/／]\s*/).filter(Boolean)
  const picks: { url: string; subclassUrl: string; level: number }[] = []
  for (const p of pairs) {
    const e = findEntry(index.classes, p.name)
    if (!e) { notes.push(`未找到职业「${p.name}」`); continue }
    const sub = subs.map(s => findEntry(e.subclasses, s)).find(Boolean)
    picks.push({ url: e.url, subclassUrl: sub?.url ?? '', level: p.level })
  }
  if (picks.length) {
    c.classUrl = picks[0].url
    c.subclassUrl = picks[0].subclassUrl
    c.multiclasses = picks.slice(1).map((p): MulticlassPick => ({
      classUrl: p.url, subclassUrl: p.subclassUrl, level: p.level, skill: null,
    }))
    c.level = picks.reduce((n, p) => n + p.level, 0)
  } else {
    c.level = Math.max(1, Math.min(20, parseInt(p1.level, 10) || 1))
  }

  // 种族「人类（亚种）」、背景
  const [raceName, subrace] = String(p1.race ?? '').split(/[（(）)]/)
  const sp = findEntry(index.speciesGroups.flatMap(g => g.entries), raceName ?? '')
  if (sp) { c.speciesUrl = sp.url; c.subraceChoice = subrace?.trim() ?? '' }
  else if (raceName) notes.push(`未找到种族「${raceName}」`)
  const bg = findEntry(index.backgroundGroups.flatMap(g => g.entries), String(p1.background ?? ''))
  if (bg) c.backgroundUrl = bg.url
  else if (p1.background) notes.push(`未找到背景「${p1.background}」`)

  // 属性：面团存的是总值，只能当自定义基础值导入
  const stats = (p1.stats ?? {}) as Record<string, number>
  if (Object.keys(stats).length) {
    c.abilityMethod = 'custom'
    c.baseScores = { ...c.baseScores }
    for (const [k, v] of Object.entries(stats)) if (MB_ABILITY[k]) c.baseScores[MB_ABILITY[k]] = +v || null
    notes.push('属性值按面团中的总值导入为基础值；背景、种族、专长的加值会再加一次，请在「属性值」里扣除')
  }

  c.shield = p1.shield === '是'
  c.weaponIds = ((p1.weapons ?? []) as Loose[])
    .map(w => WEAPONS.find(d => d.nameCn && String(w.name ?? '').includes(d.nameCn))?.id)
    .filter((x): x is string => !!x)
  c.alignment = String(p2.alignment ?? '')
  c.about = String(p2.backstory ?? '')
  const langs = String(p2.languages ?? '').split(/[、，,\s]+/).filter(Boolean)
  if (langs.length) c.languages = [...new Set(['通用语', ...langs])]
  const spells = ((p2.spells?.structuredList ?? []) as Loose[]).map(s => String(s.name ?? '').trim()).filter(Boolean)
  if (spells.length) {
    c.spellsText = spells.join('\n')
    notes.push(`${spells.length} 个法术已放入「手动补充」，可在法术面板改为从列表勾选`)
  }
  notes.push('技能、专长、装备需重新选择')
  return { choices: c, notes }
}

export function importCharacter(text: string, index: BookIndex): ImportResult {
  let data: Loose
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('不是有效的 JSON 文件')
  }
  if (data?.format === SAVE_FORMAT && data.choices) {
    return { choices: normalizeChoices(data.choices), notes: [] }
  }
  if (data?.page1 && data?.meta) return fromMianbuan(data as { page1: Loose; page2?: Loose }, index)
  throw new Error('无法识别：既不是本工具的存档，也不是面团角色卡存档')
}
