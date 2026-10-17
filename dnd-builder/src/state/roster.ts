// 多角色存档：所有角色的「选择」存在一个键里，外加当前角色 id。
// 首次加载时把旧的单角色草稿（DRAFT_KEY）迁移为第一个角色。

import type { CharacterChoices } from '../types'
import { DEFAULT_CHOICES, DRAFT_KEY, loadDraft, migrateDraft } from './draft'

export const ROSTER_KEY = 'dnd5r-builder:roster'

export interface Roster {
  current: string
  chars: Record<string, CharacterChoices>
}

export const newCharId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** 补齐新字段并迁移旧键 */
export const normalizeChoices = (c: Partial<CharacterChoices>): CharacterChoices =>
  migrateDraft({ ...DEFAULT_CHOICES, ...c })

export function loadRoster(): Roster {
  try {
    const raw = localStorage.getItem(ROSTER_KEY)
    if (raw) {
      const r = JSON.parse(raw) as Roster
      const chars = Object.fromEntries(Object.entries(r.chars ?? {}).map(([k, v]) => [k, normalizeChoices(v)]))
      const ids = Object.keys(chars)
      if (ids.length) return { current: chars[r.current] ? r.current : ids[0], chars }
    }
  } catch {
    // 损坏的存档：退回旧草稿
  }
  const id = newCharId()
  return { current: id, chars: { [id]: loadDraft() } }
}

export function saveRoster(r: Roster) {
  localStorage.setItem(ROSTER_KEY, JSON.stringify(r))
  // 旧草稿键已迁移，不再需要
  localStorage.removeItem(DRAFT_KEY)
}

// ---- 单角色存档文件（导出 / 导入） ----

export const SAVE_FORMAT = 'dnd5r-builder'

export function exportSave(c: CharacterChoices): string {
  return JSON.stringify({ format: SAVE_FORMAT, version: 1, savedAt: new Date().toISOString(), choices: c }, null, 2)
}
