import { describe, expect, it } from 'vitest'
import {
  casterType, classInstances, hitDiceLabel, maxPreparableRing, multiclassProfs, parsePrereq,
  prereqOf, spellPreparable, spellSlotsFor, unmetPrereq,
} from './multiclass'
import { choices, eldritchKnight, fighter, loaded, mc, paladin, sorcerer, spells } from '../test/fixtures'
import type { AbilityKey } from '../types'

const scores = (o: Partial<Record<AbilityKey, number>>) =>
  ({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, ...o })

describe('兼职先决', () => {
  it('解析「或」「与」及混合写法', () => {
    expect(parsePrereq('力量或敏捷')).toEqual([['STR', 'DEX']])
    expect(parsePrereq('力量与魅力')).toEqual([['STR'], ['CHA']])
    expect(parsePrereq('力量或敏捷，智力')).toEqual([['STR', 'DEX'], ['INT']])
  })

  it('圣武士需要力量与魅力都 ≥13：力量 10 不满足', () => {
    const p = prereqOf(paladin)
    expect(unmetPrereq(p, scores({ STR: 10, CHA: 20 }))).toEqual([['STR']])
    expect(unmetPrereq(p, scores({ STR: 13, CHA: 13 }))).toEqual([])
  })
})

describe('施法类型与法术位', () => {
  it('从职业表推断施法类型', () => {
    expect(casterType({ cls: sorcerer, subclass: null })).toBe('full')
    expect(casterType({ cls: paladin, subclass: null })).toBe('half')
    expect(casterType({ cls: fighter, subclass: null })).toBe('none')
    expect(casterType({ cls: fighter, subclass: eldritchKnight })).toBe('third')
  })

  it('术士4/圣武士1：兼职施法者等级 5 → 4/3/2', () => {
    const c = choices({ level: 5, classUrl: 's', multiclasses: [{ classUrl: 'p', subclassUrl: '', level: 1, skill: null }] })
    const inst = classInstances(c, loaded({ cls: sorcerer, multiclasses: mc('p', paladin) }))
    const r = spellSlotsFor(inst)
    expect(r.mode).toBe('multi')
    expect(r.casterLevel).toBe(5)
    expect(r.slots).toEqual({ 1: 4, 2: 3, 3: 2 })
    expect(hitDiceLabel(inst)).toBe('1d10 + 4d6')
  })

  it('单职业奥法骑士 4 级按自身表：3 个一环位（不是兼职的向下取整）', () => {
    const c = choices({ level: 4, classUrl: 'f' })
    const inst = classInstances(c, loaded({ cls: fighter, subclass: eldritchKnight }))
    expect(spellSlotsFor(inst).slots).toEqual({ 1: 3 })
  })

  it('奥法骑士 2 级尚未获得施法', () => {
    const inst = classInstances(choices({ level: 2, classUrl: 'f' }), loaded({ cls: fighter, subclass: eldritchKnight }))
    expect(spellSlotsFor(inst).mode).toBe('none')
  })
})

describe('兼职熟练', () => {
  it('圣武士兼职给军用武器、轻甲、中甲、盾牌，不给重甲', () => {
    const p = multiclassProfs(paladin)
    expect(p).toMatchObject({ weapons: '军用武器', light: true, medium: true, heavy: false, shield: true })
  })
  it('术士兼职只给生命骰', () => {
    expect(multiclassProfs(sorcerer)).toMatchObject({ weapons: '', light: false, shield: false, skillChoices: null })
  })
})

describe('可准备的法术环阶', () => {
  const find = (n: string) => spells.find(s => s.name.startsWith(n))!

  it('术士 1 级只到一环；兼职时各职业按自己的等级判断', () => {
    const one = classInstances(choices({ level: 1, classUrl: 's' }), loaded({ cls: sorcerer }))
    expect(maxPreparableRing(one[0])).toBe(1)
    expect(spellPreparable(find('火焰箭'), one)).toBe(true)
    expect(spellPreparable(find('迷踪步'), one)).toBe(false) // 二环

    // 术士4/圣武士1：法术位有三环，但术士 4 级只能准备到二环，圣武士 1 级只到一环
    const c = choices({ level: 5, classUrl: 's', multiclasses: [{ classUrl: 'p', subclassUrl: '', level: 1, skill: null }] })
    const inst = classInstances(c, loaded({ cls: sorcerer, multiclasses: mc('p', paladin) }))
    expect(inst.map(maxPreparableRing)).toEqual([2, 1])
    expect(spellPreparable(find('迷踪步'), inst)).toBe(true)
  })

  it('奥法骑士用法师列表：3 级一环、7 级二环', () => {
    const at = (lv: number) => classInstances(choices({ level: lv, classUrl: 'f' }), loaded({ cls: fighter, subclass: eldritchKnight }))[0]
    expect(maxPreparableRing(at(2))).toBe(-1)
    expect(maxPreparableRing(at(3))).toBe(1)
    expect(maxPreparableRing(at(7))).toBe(2)
    expect(spellPreparable(find('护盾术'), [at(3)])).toBe(true) // 法师法术
  })
})
