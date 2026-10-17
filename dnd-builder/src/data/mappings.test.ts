import { describe, expect, it } from 'vitest'
import { parseAbilityBonus } from './mappings'

const p = (t: string) => {
  const r = parseAbilityBonus(t)
  return { fixed: r.fixed, schemes: r.schemes.map(sc => sc.map(c => [c.amount, c.options.join('/')])) }
}

describe('parseAbilityBonus', () => {
  it('固定加值', () => {
    expect(p('你的智力增加2点。')).toEqual({ fixed: { INT: 2 }, schemes: [] })
    expect(p('你的体质加2，你的感知加1。')).toEqual({ fixed: { CON: 2, WIS: 1 }, schemes: [] })
    expect(p('你的魅力提升1，至多提升至20。')).toEqual({ fixed: { CHA: 1 }, schemes: [] })
  })

  it('「力量或敏捷」是二选一，不能被当成固定的敏捷+1', () => {
    expect(p('你的力量或敏捷提升1，至多提升至20。')).toEqual({ fixed: {}, schemes: [[[1, 'STR/DEX']]] })
    expect(p('你的智力、感知或魅力提升1点。')).toEqual({ fixed: {}, schemes: [[[1, 'INT/WIS/CHA']]] })
  })

  it('「或者」给出并列方案，「另一项」不重复计数', () => {
    expect(p('你选择的一项属性提升2，或者你选择的两项属性各提升1。'))
      .toEqual({ fixed: {}, schemes: [[[2, '']], [[1, ''], [1, '']]] })
    expect(p('你可以选择一项属性提升2，并选择另一项属性提升1。'))
      .toEqual({ fixed: {}, schemes: [[[2, ''], [1, '']]] })
  })

  it('不含加值的文本不误判', () => {
    expect(p('你的力量或敏捷检定具有优势。')).toEqual({ fixed: {}, schemes: [] })
    expect(p('你拥有60尺黑暗视觉。')).toEqual({ fixed: {}, schemes: [] })
  })
})
