import { describe, expect, it } from 'vitest'
import { grantedSpells, parseTraitTable } from './spells'
import { choices, elf, loaded } from '../test/fixtures'

const lineage = elf.traits.find(t => t.name.includes('精灵血系'))!
const names = (xs: { name: string; level: number }[]) => xs.map(g => `${g.name.replace(/[A-Za-z].*$/, '')}@${g.level}`)

describe('精灵血系选项表', () => {
  it('解析出三个血系行与 1/3/5 级列', () => {
    const t = parseTraitTable(lineage)!
    expect(t.rows.map(r => r.name)).toEqual(['卓尔Drow', '高等精灵High Elf', '木精灵Wood Elf'])
    expect(t.levels.slice(1)).toEqual([1, 3, 5])
  })

  it('卓尔 5 级：舞光术/妖火/黑暗术；「黑暗视觉提升至120尺」不算授予法术', () => {
    const g = grantedSpells(choices({ level: 5 }), loaded({ species: elf }))
    expect(names(g)).toEqual(['舞光术@1', '妖火@3', '黑暗术@5'])
  })

  it('按等级解锁：3 级时还没有黑暗术', () => {
    const g = grantedSpells(choices({ level: 3 }), loaded({ species: elf }))
    expect(names(g)).toEqual(['舞光术@1', '妖火@3'])
  })

  it('改选高等精灵', () => {
    const g = grantedSpells(
      choices({ level: 5, traitOptions: { [lineage.name]: '高等精灵High Elf' } }),
      loaded({ species: elf })
    )
    expect(names(g)).toEqual(['魔法伎俩@1', '侦测魔法@3', '迷踪步@5'])
  })
})
