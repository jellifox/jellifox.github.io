import { describe, expect, it } from 'vitest'
import { deriveCharacter } from './character'
import { WEAPONS, weaponProficient } from './rules'
import { choices, fighter, loaded, mc, paladin, sorcerer } from '../test/fixtures'
import type { AbilityKey } from '../types'

const w = (id: string) => WEAPONS.find(x => x.id === id)!
const custom = (s: Partial<Record<AbilityKey, number>>) => ({
  abilityMethod: 'custom' as const,
  baseScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, ...s },
})

describe('weaponProficient', () => {
  it('解析各种熟练文本', () => {
    expect(weaponProficient(w('longsword'), '简易和军用武器')).toBe(true)
    expect(weaponProficient(w('longsword'), '简易武器')).toBe(false)
    expect(weaponProficient(w('dagger'), '简易武器')).toBe(true)
    const rogue = '简易武器以、具有灵巧或轻型词条的军用武器'
    expect(weaponProficient(w('rapier'), rogue)).toBe(true)
    expect(weaponProficient(w('hand-crossbow'), rogue)).toBe(true)
    expect(weaponProficient(w('longsword'), rogue)).toBe(false)
    expect(weaponProficient(w('longbow'), '军用远程武器')).toBe(true)
    expect(weaponProficient(w('longsword'), '军用远程武器')).toBe(false)
  })
})

describe('武器攻击', () => {
  it('术士用长剑：不加熟练；兼职圣武士后加熟练', () => {
    const base = { classUrl: 's', weaponIds: ['longsword'], ...custom({ STR: 14 }) }
    const solo = deriveCharacter(choices({ level: 5, ...base }), loaded({ cls: sorcerer }))
    expect(solo.weapons[0]).toMatchObject({ proficient: false, attackBonus: 2 })
    const multi = deriveCharacter(
      choices({ level: 5, ...base, multiclasses: [{ classUrl: 'p', subclassUrl: '', level: 1, skill: null }] }),
      loaded({ cls: sorcerer, multiclasses: mc('p', paladin) })
    )
    expect(multi.weapons[0]).toMatchObject({ proficient: true, attackBonus: 5 })
  })

  it('战士精通名额 3，只认熟练武器且不超额', () => {
    const d = deriveCharacter(
      choices({ level: 1, classUrl: 'f', weaponIds: ['greatsword'], masteryIds: ['greatsword', 'nope', 'longbow', 'dagger', 'maul'] }),
      loaded({ cls: fighter })
    )
    expect(d.masteryCount).toBe(3)
    expect(d.masteryIds).toEqual(['greatsword', 'longbow', 'dagger'])
    expect(d.weapons[0].mastery).toBe('擦掠')
  })
})

describe('护甲等级', () => {
  it('术士穿板甲：未受训提示 + 力量不足减速', () => {
    const d = deriveCharacter(choices({ level: 1, classUrl: 's', armorId: 'plate', ...custom({ STR: 10 }) }), loaded({ cls: sorcerer }))
    expect(d.ac).toBe(18)
    expect(d.speed).toBe(20)
    expect(d.armorNotes.join()).toMatch(/未受训重甲.*力量低于 15/)
  })

  it('未受训盾牌不加 AC', () => {
    const d = deriveCharacter(choices({ level: 1, classUrl: 's', shield: true, ...custom({ DEX: 14 }) }), loaded({ cls: sorcerer }))
    expect(d.ac).toBe(12)
  })
})
