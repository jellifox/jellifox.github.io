import { describe, expect, it } from 'vitest'
import { activeFeats, deriveAbilities, deriveHp, effectiveSubrace, speciesTraits } from './build'
import { choices, corvum, generalFeats, loaded, mc, paladin, sorcerer } from '../test/fixtures'

const asi = generalFeats.find(f => f.name.startsWith('属性值提升'))!
const custom = (o: Record<string, number>) => ({
  abilityMethod: 'custom' as const,
  baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, ...o },
})

describe('deriveHp', () => {
  it('兼职：只有起始职业 1 级取满，兼职职业首级按平均值（术士4/圣武士1，体质+3 → 39）', () => {
    const c = choices({ level: 5, classUrl: 's', multiclasses: [{ classUrl: 'p', subclassUrl: '', level: 1, skill: null }] })
    const hp = deriveHp(c, loaded({ cls: sorcerer, multiclasses: mc('p', paladin) }), [], 3)
    // 6+3 + 3×(4+3) + (6+3)
    expect(hp.max).toBe(39)
    expect(hp.dice).toEqual([6, 6, 6, 6, 10])
  })

  it('逐级投骰：缺失的级数回退为平均值', () => {
    const c = choices({ level: 3, classUrl: 's', hpMethod: 'roll', hpRolls: [1] })
    expect(deriveHp(c, loaded({ cls: sorcerer }), [], 0).max).toBe(6 + 1 + 4)
  })
})

describe('deriveAbilities 上限', () => {
  it('自定义基础值超过 20 时保留，不被压到 20', () => {
    const c = choices(custom({ INT: 22 }))
    expect(deriveAbilities(c, null, null, loaded()).total.INT).toBe(22)
  })

  it('普通加值不能让属性超过 20', () => {
    const c = choices({ ...custom({ INT: 19 }), level: 4, classUrl: 's', feats: { lv4: asi },
      abilityPicks: { 'feat:lv4:0': 'INT' } })
    expect(deriveAbilities(c, null, null, loaded({ cls: sorcerer })).total.INT).toBe(20)
  })
})

describe('activeFeats', () => {
  it('降级后消失槽位里的专长不再生效，升回后恢复', () => {
    const base = { ...custom({}), classUrl: 's', feats: { lv8: asi }, abilityPicks: { 'feat:lv8:0': 'WIS' as const } }
    const at8 = choices({ ...base, level: 8 })
    const at4 = choices({ ...base, level: 4 })
    const L = loaded({ cls: sorcerer })
    expect(Object.keys(activeFeats(at8, L))).toEqual(['lv8'])
    expect(deriveAbilities(at8, null, null, L).total.WIS).toBe(12)
    expect(activeFeats(at4, L)).toEqual({})
    expect(deriveAbilities(at4, null, null, L).total.WIS).toBe(10)
  })
})

describe('亚种', () => {
  it('未选亚种时按显示的第一个生效，特质 = 共通 + 亚种', () => {
    expect(effectiveSubrace(corvum, '')).toBe('昏鸦族 Dusk Corvum')
    const traits = speciesTraits(corvum, '')
    expect(traits.length).toBe(corvum.traits.length + corvum.subraces[0].traits.length)
  })
})
