import { describe, expect, it } from 'vitest'
import { DEFAULT_CHOICES, migrateDraft } from './draft'

describe('migrateDraft', () => {
  it('把按下标的旧兼职键换成按 classUrl 的稳定键', () => {
    const old = {
      ...DEFAULT_CHOICES,
      multiclasses: [
        { classUrl: '圣武士.htm', subclassUrl: '', level: 2, skill: null },
        { classUrl: '吟游诗人.htm', subclassUrl: '', level: 4, skill: null },
      ],
      feats: { lv4: { name: 'A', desc: '' }, 'mc1:lv4': { name: 'B', desc: '' } },
      abilityPicks: { 'feat:mc1:lv4:0': 'CON' as const, 'feat:lv4:0': 'INT' as const },
      bonusSchemes: { 'feat:mc0:style': 1 },
    }
    const m = migrateDraft(old)
    expect(Object.keys(m.feats).sort()).toEqual(['lv4', 'mc:吟游诗人.htm:lv4'])
    expect(m.abilityPicks).toEqual({ 'feat:mc:吟游诗人.htm:lv4:0': 'CON', 'feat:lv4:0': 'INT' })
    expect(m.bonusSchemes).toEqual({ 'feat:mc:圣武士.htm:style': 1 })
  })

  it('新格式草稿原样保留', () => {
    const cur = { ...DEFAULT_CHOICES, feats: { 'mc:x.htm:lv4': { name: 'A', desc: '' } } }
    expect(migrateDraft(cur).feats).toEqual(cur.feats)
  })
})
