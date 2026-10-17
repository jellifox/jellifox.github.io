// 补齐项：龙族体魄、轶闻知识的「已熟练则专精」、法师学者限定专精、人类多才多艺起源专长、游侠语言
import { describe, expect, it } from 'vitest'
import { deriveCharacter } from './character'
import { allFeatSlots } from './build'
import { applySkillPicks, languagePicks, skillChoicesIn } from './skills'
import { choices, elf, loaded, sorcerer } from '../test/fixtures'
import type { ClassData, SubclassData } from '../types'

const draconic: SubclassData = {
  id: 'drac', nameCn: '龙族术法', nameEn: 'Draconic Sorcery', desc: '',
  features: [{
    name: '3级：龙族体魄 Draconic Resilience',
    desc: '魔法在你的体内流动。你的生命值上限提升3，此后每提升一个术士等级，都将再次提升1。 你部分皮肤覆盖着龙鳞样式的柔鳞。未着装护甲时，你的基础AC等于10+你的敏捷调整值＋你的魅力调整值。',
  }],
}
const custom = { abilityMethod: 'custom' as const, baseScores: { STR: 8, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 16 } }

describe('龙族体魄', () => {
  it('术士 5 级：生命值 +5，无甲 AC = 10+敏捷+魅力', () => {
    const base = deriveCharacter(choices({ level: 5, classUrl: 's', ...custom }), loaded({ cls: sorcerer }))
    const d = deriveCharacter(choices({ level: 5, classUrl: 's', subclassUrl: 'drac', ...custom }), loaded({ cls: sorcerer, subclass: draconic }))
    expect(d.hp.max - base.hp.max).toBe(5)
    expect(d.hp.featureNotes).toEqual(['龙族体魄 +5'])
    expect(base.ac).toBe(12)
    expect(d.ac).toBe(15)
    // 穿甲时不适用
    expect(deriveCharacter(choices({ level: 5, classUrl: 's', subclassUrl: 'drac', armorId: 'leather', ...custom }), loaded({ cls: sorcerer, subclass: draconic })).ac).toBe(13)
  })

  it('2 级时尚未获得', () => {
    const d = deriveCharacter(choices({ level: 2, classUrl: 's', subclassUrl: 'drac', ...custom }), loaded({ cls: sorcerer, subclass: draconic }))
    expect(d.ac).toBe(12)
    expect(d.hp.featureNotes).toEqual([])
  })
})

describe('轶闻知识：已熟练则改为专精', () => {
  const lore = '轶闻知识Lore Knowledge。 选择下列技能之一：奥秘、历史、调查、自然、宗教。如果你不具有所选技能的熟练，则你获得其熟练；如果你已有熟练，则你获得其 专精 。'
  it('解析出 upgrade 标记', () => {
    expect(skillChoicesIn(lore)).toEqual([{ count: 1, options: ['arcana', 'history', 'investigation', 'nature', 'religion'], upgrade: true }])
  })
  it('未熟练给熟练，已熟练给专精', () => {
    const ch = { key: 'k', source: 's', ...skillChoicesIn(lore)[0] }
    expect(applySkillPicks([ch], { k: ['history'] }, new Set())).toEqual({ proficient: ['history'], expertise: [] })
    expect(applySkillPicks([ch], { k: ['history'] }, new Set(['history']))).toEqual({ proficient: [], expertise: ['history'] })
  })
})

describe('法师学者', () => {
  const wizard: ClassData = {
    ...sorcerer, id: 'wiz', nameCn: '法师',
    levels: [
      { ...sorcerer.levels[0], level: 1, features: ['施法'] },
      { ...sorcerer.levels[1], level: 2, features: ['学者'] },
    ],
  }
  it('专精只能落在学术技能上', () => {
    const d0 = deriveCharacter(choices({ level: 2, classUrl: 'w', classSkills: ['arcana', 'insight'] }), loaded({ cls: wizard }))
    expect(d0.expertiseSources).toHaveLength(1)
    const key = d0.expertiseSources[0].key
    const d = deriveCharacter(
      choices({ level: 2, classUrl: 'w', classSkills: ['arcana', 'insight'], expertisePicks: { [key]: ['insight', 'arcana'] } }),
      loaded({ cls: wizard })
    )
    expect(d.expertise).toEqual(['arcana'])
    expect(d.skillBonus.arcana).toBe(4)
  })
})

describe('人类多才多艺', () => {
  const human = { ...elf, nameCn: '人类', subraces: [], traits: [{ name: '多才多艺Versatile', desc: '你获得一项自选的起源专长。推荐选择 熟习Skilled 专长。' }] }
  it('多出一个起源专长槽，所选专长的自选技能生效', () => {
    const slots = allFeatSlots(choices(), loaded({ species: human }))
    expect(slots).toEqual([{ key: 'species-origin', label: '种族·多才多艺 · 起源专长', kind: 'origin', level: 1 }])
    const skilled = { name: '熟习 Skilled', desc: '你获得共计三项自选的技能和工具熟练。' }
    const d = deriveCharacter(choices({ feats: { 'species-origin': skilled } }), loaded({ species: human }))
    expect(d.feats.map(f => f.name)).toContain('熟习 Skilled')
    expect(d.skillChoices.map(c => c.count)).toEqual([3])
  })
})

it('游侠熟练探险家多 2 种语言', () => {
  expect(languagePicks([])).toBe(2)
  expect(languagePicks(['熟练探险家'])).toBe(4)
})
