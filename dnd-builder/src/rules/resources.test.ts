import { describe, expect, it } from 'vitest'
import { classResources } from './resources'
import { classInstances } from './multiclass'
import { choices, fighter, loaded, mc, paladin, sorcerer } from '../test/fixtures'

const mods = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 3 }
const byName = (r: ReturnType<typeof classResources>) => Object.fromEntries(r.limits.map(l => [l.name, l.uses]))

describe('classResources', () => {
  it('术士 5 级：术法点 5，武器精通之类的数量列与法术列不算资源', () => {
    const inst = classInstances(choices({ level: 5, classUrl: 's' }), loaded({ cls: sorcerer }))
    expect(byName(classResources(inst, mods))).toEqual({ 术法点: 5 })
  })

  it('战士 9 级：回气、动作如潮、不屈；武器精通不是资源', () => {
    const inst = classInstances(choices({ level: 9, classUrl: 'f' }), loaded({ cls: fighter }))
    const r = byName(classResources(inst, mods))
    expect(r).toMatchObject({ 回气: 3, 动作如潮: 1, 不屈: 1 })
    expect(r).not.toHaveProperty('武器精通')
  })

  it('兼职圣武士 3 级：圣疗池按圣武士等级 = 15，名称注明职业', () => {
    const c = choices({ level: 7, classUrl: 's', multiclasses: [{ classUrl: 'p', subclassUrl: '', level: 3, skill: null }] })
    const inst = classInstances(c, loaded({ cls: sorcerer, multiclasses: mc('p', paladin) }))
    expect(byName(classResources(inst, mods))).toMatchObject({ '圣疗池（圣武士）': 15, '术法点（术士）': 4 })
  })
})
