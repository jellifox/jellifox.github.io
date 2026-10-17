import { describe, expect, it } from 'vitest'
import { deriveCharacter, featPrereqUnmet } from './character'
import { choices, fighter, generalFeats, loaded, sorcerer } from '../test/fixtures'

const feat = (re: RegExp) => generalFeats.find(f => re.test(f.name))!
const custom = (STR: number, DEX: number) => ({
  abilityMethod: 'custom' as const,
  baseScores: { STR, DEX, CON: 10, INT: 10, WIS: 10, CHA: 10 },
})

describe('featPrereqUnmet', () => {
  it('等级与「力量或敏捷13+」', () => {
    const grappler = feat(/擒抱者|Grappler/)
    const weak = deriveCharacter(choices({ level: 3, classUrl: 'f', ...custom(10, 12) }), loaded({ cls: fighter }))
    expect(featPrereqUnmet(grappler.desc, weak)).toHaveLength(2)
    const ok = deriveCharacter(choices({ level: 4, classUrl: 'f', ...custom(10, 13) }), loaded({ cls: fighter }))
    expect(featPrereqUnmet(grappler.desc, ok)).toEqual([])
  })

  it('护甲受训与施法特性', () => {
    const heavy = feat(/重甲大师|Heavy Armor Master/)
    const war = feat(/战地施法者|War Caster/)
    const f = deriveCharacter(choices({ level: 4, classUrl: 'f' }), loaded({ cls: fighter }))
    const s = deriveCharacter(choices({ level: 4, classUrl: 's' }), loaded({ cls: sorcerer }))
    expect(featPrereqUnmet(heavy.desc, f)).toEqual([])
    expect(featPrereqUnmet(heavy.desc, s)).toEqual(['重甲受训'])
    expect(featPrereqUnmet(war.desc, f)).toEqual(['施法或契约魔法特性'])
    expect(featPrereqUnmet(war.desc, s)).toEqual([])
  })
})
