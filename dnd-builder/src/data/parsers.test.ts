import { describe, expect, it } from 'vitest'
import { corvum, elf, fighter, generalFeats, paladin, sorcerer, spells } from '../test/fixtures'

describe('parseSpecies', () => {
  it('精灵：5 条特质，精灵血系不在「从」处截断且带血系表', () => {
    expect(elf.traits.map(t => t.name)).toHaveLength(5)
    const lineage = elf.traits.find(t => t.name.includes('精灵血系'))!
    expect(lineage.desc).toContain('精灵血系表格中选择其一')
    expect(lineage.desc).toMatch(/卓尔Drow ｜ .*妖火/)
    // 卓尔/高等精灵/木精灵是「特质」标记之前的背景故事红标，不是亚种
    expect(elf.subraces).toHaveLength(0)
  })

  it('谦卑林鸦族：共通特质 + 两个亚种，各自带属性加值特质', () => {
    expect(corvum.subraces.map(s => s.name)).toEqual(['昏鸦族 Dusk Corvum', '煽鸦族 Kindled Corvum'])
    for (const s of corvum.subraces) {
      expect(s.traits.some(t => /属性值加成/.test(t.name))).toBe(true)
    }
  })
})

describe('parseClass', () => {
  it('术士：d6 生命骰、魅力施法、4 级法术位 4/3', () => {
    expect(sorcerer.hitDie).toBe(6)
    expect(sorcerer.spellAbility).toBe('CHA')
    expect(sorcerer.levels.find(r => r.level === 4)?.slots).toEqual({ 1: 4, 2: 3 })
  })

  it('圣武士：兼职段写明军用武器与轻中甲盾牌', () => {
    expect(paladin.multiclassText).toMatch(/军用武器熟练.*轻甲.*中甲.*盾牌/)
    expect(paladin.primaryAbility).toMatch(/力量.*魅力/)
  })

  it('战士：职业表无法术位', () => {
    expect(fighter.levels.every(r => !r.slots || Object.keys(r.slots).length === 0)).toBe(true)
  })
})

describe('parseFeatPage', () => {
  it('通用专长页：40 个以上专长，含演员与属性值提升', () => {
    expect(generalFeats.length).toBeGreaterThanOrEqual(40)
    expect(generalFeats.some(f => f.name.startsWith('演员'))).toBe(true)
    expect(generalFeats.some(f => f.name.startsWith('属性值提升'))).toBe(true)
  })
})

describe('parseSpellList', () => {
  it('万法大全总表：解析环阶、学派、职业缩写（软 = 游侠）', () => {
    const hm = spells.find(s => s.name.startsWith('猎人印记'))!
    expect(hm.ring).toBe(1)
    expect(hm.classes).toEqual(['游侠'])
    const acid = spells.find(s => s.name.startsWith('酸液飞溅'))!
    expect(acid.ring).toBe(0)
    const speak = spells.find(s => s.name.startsWith('动物交谈'))!
    expect(speak.ritual).toBe(true)
    expect(speak.school).toBe('预言')
  })
})
