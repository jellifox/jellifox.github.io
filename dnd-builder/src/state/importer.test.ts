import { describe, expect, it } from 'vitest'
import { importCharacter } from './importer'
import { exportSave } from './roster'
import { toMianbuan } from '../rules/mianbuan'
import type { BookIndex } from '../data/toc'
import { choices, loaded, mc, paladin, sorcerer } from '../test/fixtures'

const index: BookIndex = {
  classes: [
    { title: '术士 Sorcerer', url: 'sorc', source: '', optionalResources: [],
      subclasses: [{ title: '龙族术法 Draconic Sorcery', url: 'drac', source: '' }] },
    { title: '圣武士 Paladin', url: 'pal', source: '', optionalResources: [], subclasses: [] },
  ],
  speciesGroups: [{ group: '核心', entries: [{ title: '人类 Human', url: 'human', source: '' }] }],
  backgroundGroups: [{ group: '核心', entries: [{ title: '侍僧 Acolyte', url: 'aco', source: '' }] }],
  spellLists: [],
  featPages: [],
}

describe('importCharacter', () => {
  it('本工具存档原样往返', () => {
    const c = choices({ name: '塔纳奎尔', level: 7, classUrl: 'sorc' })
    expect(importCharacter(exportSave(c), index).choices).toEqual(c)
  })

  it('面团存档：按名称回查职业/兼职/种族/背景，属性作为自定义基础值', () => {
    const c = choices({
      name: '塔纳奎尔', level: 5, classUrl: 'sorc', weaponIds: ['dagger'],
      multiclasses: [{ classUrl: 'pal', subclassUrl: '', level: 1, skill: null }],
    })
    const mb = toMianbuan(c, loaded({ cls: sorcerer, multiclasses: mc('pal', paladin) }))
    // 面团里种族/背景是名称；导出时没加载实体就为空，这里手填
    mb.page1.race = '人类'
    mb.page1.background = '侍僧'
    mb.page1.subclass = '龙族术法'
    const { choices: r, notes } = importCharacter(JSON.stringify(mb), index)
    expect(r).toMatchObject({
      name: '塔纳奎尔', level: 5, classUrl: 'sorc', subclassUrl: 'drac',
      speciesUrl: 'human', backgroundUrl: 'aco', abilityMethod: 'custom', weaponIds: ['dagger'],
    })
    expect(r.multiclasses).toEqual([{ classUrl: 'pal', subclassUrl: '', level: 1, skill: null }])
    expect(notes.join()).toMatch(/基础值/)
  })

  it('无法识别的文件报错', () => {
    expect(() => importCharacter('{"a":1}', index)).toThrow(/无法识别/)
    expect(() => importCharacter('not json', index)).toThrow(/JSON/)
  })
})
