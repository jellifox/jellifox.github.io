import { describe, expect, it } from 'vitest'
import { checklist } from './checklist'
import { deriveCharacter } from './character'
import { choices, fighter, loaded, sorcerer } from '../test/fixtures'

const texts = (c: Parameters<typeof deriveCharacter>[0], l: Parameters<typeof deriveCharacter>[1]) =>
  checklist(deriveCharacter(c, l)).map(i => `${i.level}:${i.text}`)

describe('checklist', () => {
  it('空白角色列出基础待办', () => {
    const t = texts(choices(), loaded())
    expect(t).toEqual(expect.arrayContaining(['todo:填写角色名', 'todo:选择职业', 'todo:选择种族', 'todo:选择背景']))
  })

  it('战士 3 级：子职、技能、精通待选；术士穿板甲给警告', () => {
    const f = texts(choices({ name: 'x', level: 3, classUrl: 'f' }), loaded({ cls: fighter }))
    expect(f).toEqual(expect.arrayContaining(['todo:选择战士子职', 'todo:武器精通还差 3 项']))
    expect(f.some(t => /职业技能熟练还差/.test(t))).toBe(true)
    const s = texts(choices({ name: 'x', level: 1, classUrl: 's', armorId: 'plate' }), loaded({ cls: sorcerer }))
    expect(s.some(t => /^warn:未受训重甲/.test(t))).toBe(true)
    expect(s).not.toContain('todo:选择术士子职')
  })
})
