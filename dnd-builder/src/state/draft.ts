// 车卡草稿：默认值、本地存档读取与旧格式迁移。

import type { CharacterChoices } from '../types'
import { multiclassKeyPrefix } from '../rules/multiclass'

export const DEFAULT_CHOICES: CharacterChoices = {
  name: '',
  alignment: '绝对中立',
  level: 1,
  classUrl: '',
  subclassUrl: '',
  multiclasses: [],
  speciesUrl: '',
  subraceChoice: '',
  sizeChoice: '',
  backgroundUrl: '',
  bgBonusMode: '2+1',
  bgPlus2: null,
  bgPlus1: null,
  abilityPicks: {},
  bonusSchemes: {},
  traitOptions: {},
  abilityMethod: 'array',
  hpMethod: 'average',
  hpRolls: [],
  hpManual: null,
  baseScores: { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
  rolledSets: [],
  rollSetIndex: -1,
  classSkills: [],
  skillPicks: {},
  expertisePicks: {},
  classEquipChoice: 0,
  bgEquipChoice: 0,
  armorId: 'none',
  shield: false,
  weaponIds: [],
  masteryIds: [],
  languages: ['通用语'],
  toolChoice: '',
  spells: [],
  spellsText: '',
  feats: {},
  about: '',
}

// ---- 车卡进度本地存档（关闭页面不丢进度） ----
// 只存用户的「选择」，不存解析出的实体——后者按 URL 从实体缓存重建，
// 这样存档很小，也不会随规则书更新而失效。
export const DRAFT_KEY = 'dnd5r-builder:draft'

/**
 * 迁移旧草稿：早期兼职键用数组下标（'mc0:lv4'、'feat:mc0:lv4:0'），删除兼职会错位；
 * 现改为 'mc:<classUrl>:'。按旧草稿里 multiclasses 的顺序换算一次。
 */
export function migrateDraft(c: CharacterChoices): CharacterChoices {
  const urls = (c.multiclasses ?? []).map(m => m.classUrl)
  const rekey = <T,>(rec: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      Object.entries(rec ?? {}).map(([k, v]) => [
        k.replace(/(^|feat:)mc(\d+):/, (all, pre: string, n: string) =>
          urls[+n] ? `${pre}${multiclassKeyPrefix(urls[+n])}` : all),
        v,
      ])
    )
  return {
    ...c,
    feats: rekey(c.feats),
    abilityPicks: rekey(c.abilityPicks),
    bonusSchemes: rekey(c.bonusSchemes),
  }
}

export function loadDraft(): CharacterChoices {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return DEFAULT_CHOICES
    // 与默认值合并：老存档缺少的新字段自动补齐
    return migrateDraft({ ...DEFAULT_CHOICES, ...(JSON.parse(raw) as Partial<CharacterChoices>) })
  } catch {
    return DEFAULT_CHOICES
  }
}
