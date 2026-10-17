import { describe, expect, it } from 'vitest'
import { featSpellChoiceIn, featSpellPicks, spellGroupOptions } from './spells'
import { deriveCharacter } from './character'
import { onClassList, classInstances } from './multiclass'
import { choices, fighter, loaded, spells } from '../test/fixtures'
import type { ClassData } from '../types'

const magicInitiate = '起源专长\n你获得以下增益。\n两道戏法Two Cantrips。从牧师法术列表、德鲁伊法术列表、法师法术列表中选择一个列表，你从该法术列表中选择两道戏法并习得之。再从智力、感知、魅力中选择一项属性，你从这个专长中习得的法术使用该属性作为施法属性。\n一环法术Level 1 Spell。你从前面所选的法术列表中再选择一道一环法术，并始终准备着这道法术。'

describe('featSpellChoiceIn', () => {
  it('魔法学徒：三选一列表，2 戏法 + 1 一环', () => {
    expect(featSpellChoiceIn(magicInitiate, 2)).toEqual({
      lists: ['牧师', '德鲁伊', '法师'], chooseList: true,
      groups: [
        { ring: 0, count: 2, schools: [], ritual: false },
        { ring: 1, count: 1, schools: [], ritual: false },
      ],
    })
  })
  it('妖精之触：学派限定、任意列表', () => {
    expect(featSpellChoiceIn('选择一道预言或惑控学派的一环法术。你始终准备着你选择的这道法术与 迷踪步Misty Step 。', 2))
      .toEqual({ lists: [], chooseList: false, groups: [{ ring: 1, count: 1, schools: ['预言', '惑控'], ritual: false }] })
  })
  it('仪式施法者：数量 = 熟练加值', () => {
    expect(featSpellChoiceIn('你选择数道具有仪式标签的一环法术，其具体数量等于你的熟练加值。', 3)!.groups)
      .toEqual([{ ring: 1, count: 3, schools: [], ritual: true }])
  })
  it('没有自选法术的专长', () => {
    expect(featSpellChoiceIn('你的生命值上限增加。', 2)).toBeNull()
  })
})

describe('魔法学徒落到角色上', () => {
  const mi = { name: '魔法学徒 Magic Initiate', desc: magicInitiate }
  it('战士选法师列表：只认法师戏法/一环、未选列表时为空', () => {
    const d0 = deriveCharacter(choices({ level: 1, classUrl: 'f', feats: { 'lv4': mi } }), loaded({ cls: fighter }))
    // 战士 1 级没有 4 级槽位，专长不生效
    expect(d0.featSpellChoices).toEqual([])

    const ch = { key: 'k', source: 's', ...featSpellChoiceIn(magicInitiate, 2)! }
    const wizCantrips = spellGroupOptions(ch.groups[0], '法师', spells).map(s => s.name)
    const wiz1 = spellGroupOptions(ch.groups[1], '法师', spells).map(s => s.name)
    const clericOnly = spellGroupOptions(ch.groups[1], '牧师', spells).find(s => !s.classes.includes('法师'))!.name
    expect(featSpellPicks([ch], { k: { list: '', spells: [wizCantrips[0]] } }, spells)).toEqual({ k: [] })
    expect(featSpellPicks([ch], {
      k: { list: '法师', spells: [...wizCantrips.slice(0, 3), wiz1[0], clericOnly] },
    }, spells)).toEqual({ k: [wizCantrips[0], wizCantrips[1], wiz1[0]] })
  })
})

it('吟游诗人 10 级魔法奥秘可用牧师/德鲁伊/法师列表', () => {
  const bard: ClassData = { ...fighter, nameCn: '吟游诗人', levels: [{ ...fighter.levels[0], level: 10, features: ['魔法奥秘'], slots: { 1: 4 } }] }
  const wizOnly = { ...spells[0], ring: 1, name: '法师独有', classes: ['法师'] }
  const at = (level: number) => classInstances(choices({ level, classUrl: 'b' }), loaded({ cls: bard }))[0]
  expect(onClassList(wizOnly, at(9))).toBe(false)
  expect(onClassList(wizOnly, at(10))).toBe(true)
})
