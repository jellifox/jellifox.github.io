import { describe, expect, it } from 'vitest'
import { expertiseSources, grantedLanguages, skillChoicesIn, toolOptions } from './skills'
import { deriveCharacter } from './character'
import { choices, corvum, elf, generalFeats, loaded, sorcerer } from '../test/fixtures'

describe('skillChoicesIn', () => {
  it('识别限定选项与任意技能', () => {
    expect(skillChoicesIn('你具有洞悉、察觉或求生之一技能的熟练。'))
      .toEqual([{ count: 1, options: ['insight', 'perception', 'survival'], upgrade: false }])
    expect(skillChoicesIn('你获得一项自选技能的熟练。')).toEqual([{ count: 1, options: null, upgrade: false }])
    expect(skillChoicesIn('你获得共计三项自选的技能和工具熟练。')).toEqual([{ count: 3, options: null, upgrade: false }])
    // 固定熟练与专精条目都不是自选熟练
    expect(skillChoicesIn('你拥有洞悉技能的熟练项。')).toEqual([])
    expect(skillChoicesIn('专精Expertise。 你选择一个拥有其熟练但不具备相应专精的技能，并获得其专精。')).toEqual([])
  })

  it('真实页面：精灵敏锐感官、鸦族善学', () => {
    const elfDesc = elf.traits.map(t => t.desc).join('\n')
    expect(skillChoicesIn(elfDesc)[0].options).toEqual(['insight', 'perception', 'survival'])
    const learned = corvum.traits.find(t => /善学/.test(t.name))!
    expect(skillChoicesIn(learned.desc)[0].options).toEqual(['arcana', 'history', 'nature', 'religion'])
  })

  it('技艺专家：一项自选熟练（专精条目不算）', () => {
    const f = generalFeats.find(x => /技艺专家/.test(x.name))!
    expect(skillChoicesIn(f.desc)).toEqual([{ count: 1, options: null, upgrade: false }])
    expect(expertiseSources([], { lv4: f })).toEqual([{ key: 'feat:lv4', source: f.name, count: 1, options: null }])
  })
})

describe('deriveCharacter 技能', () => {
  it('精灵选察觉 → 熟练，被动察觉含熟练加值；越界选择被忽略', () => {
    const d0 = deriveCharacter(choices({ level: 1, classUrl: 's' }), loaded({ cls: sorcerer, species: elf }))
    const key = d0.skillChoices[0].key
    const d = deriveCharacter(
      choices({ level: 1, classUrl: 's', skillPicks: { [key]: ['athletics', 'perception', 'insight'] } }),
      loaded({ cls: sorcerer, species: elf })
    )
    expect(d.profSkills.has('perception')).toBe(true)
    expect(d.profSkills.has('athletics')).toBe(false)
    expect(d.profSkills.has('insight')).toBe(false)
    expect(d.passivePerception).toBe(12)
  })

  it('无专精来源时专精选择不生效', () => {
    const d = deriveCharacter(choices({ level: 5, classUrl: 's', classSkills: ['arcana'], expertisePicks: { x: ['arcana'] } }), loaded({ cls: sorcerer }))
    expect(d.expertiseCount).toBe(0)
    expect(d.skillBonus.arcana).toBe(3)
  })
})

describe('工具与语言', () => {
  it('toolOptions', () => {
    expect(toolOptions('选择一种赌具')).toEqual(['骰子', '龙棋', '纸牌', '三龙牌'])
    expect(toolOptions('书法工具')).toBeNull()
  })

  it('鸦族语言特质：鸟族语、通用语，风族语仅理解', () => {
    expect(grantedLanguages(corvum.languageText, [], [])).toEqual(['鸟族语', '通用语', '风族语（仅理解）'])
  })

  it('游荡者盗贼黑话对齐到语言表全名；自选超出 2 种的不计', () => {
    expect(grantedLanguages('', ['盗贼黑话'], ["盗贼黑话Thieves' Cant"])).toEqual(["盗贼黑话Thieves' Cant"])
    const d = deriveCharacter(
      choices({ languages: ['通用语', '精灵语', '矮人语', '龙语'] }),
      loaded({ species: corvum })
    )
    expect(d.languages).toEqual(['通用语', '鸟族语', '风族语（仅理解）', '精灵语', '矮人语'])
  })
})
