// 特性赋予的法术：种族特质、子职特性、已选专长里写明的法术。
// 这些法术不占职业的戏法/准备法术名额，按角色等级逐步解锁。
//
// 数据有两种形态：
//   1) 选项表格（精灵血系、邪魔遗赠）——每行一个选项，列头为「1级/3级/5级」，
//      只有所选行的法术生效，因此需要用户选定行（存在 choices.traitOptions）。
//   2) 直接写在正文里（光辉掌者→光亮术、岩石侏儒→修复术/魔法伎俩），无需选择。
//
// 法术名一律以「已加载的法术速查列表」为词典做匹配，不维护硬编码表——
// 规则书更新时自动跟随。

import type {
  CharacterChoices, LoadedEntities, SpellEntry, TraitEntry,
} from '../types'
import { activeFeats, speciesTraits } from './build'
import { classInstances } from './multiclass'
import { subclassFeatureLevel } from '../data/parsers'

export interface GrantedSpell {
  name: string
  source: string // 来源说明，如「种族·精灵血系（卓尔Drow）」
  level: number // 获得该法术所需的角色等级
}

/** 特质里的选项表格 */
export interface TraitTable {
  traitName: string
  /** 各列对应的角色等级，索引与 rows[].cells 对齐；无「N级」列头则为 0 */
  levels: number[]
  rows: { name: string; cells: string[] }[]
}

const CELL = ' ｜ '

/**
 * 从特质描述里解析选项表格。要求：至少两列、至少两个数据行，
 * 且列头含「N级」——否则视为普通表格（如属性对照表），不作为选项。
 */
export function parseTraitTable(trait: TraitEntry): TraitTable | null {
  const lines = trait.desc.split('\n').filter(l => l.includes(CELL))
  if (lines.length < 3) return null // 表头 + 至少两个可选行
  const header = lines[0].split(CELL).map(s => s.trim())
  if (header.length < 2) return null
  const levels = header.map(h => {
    const m = h.match(/(\d+)\s*级/)
    return m ? parseInt(m[1], 10) : 0
  })
  if (!levels.some(l => l > 0)) return null // 没有等级列，不是「按等级解锁」的选项表

  const rows = lines.slice(1).map(l => {
    const cells = l.split(CELL).map(s => s.trim())
    return { name: cells[0], cells }
  }).filter(r => r.name && r.cells.length >= 2)
  if (rows.length < 2) return null
  return { traitName: trait.name, levels, rows }
}

/** 收集一组特质里所有的选项表格 */
export function traitTables(traits: TraitEntry[]): TraitTable[] {
  return traits.map(parseTraitTable).filter((t): t is TraitTable => t !== null)
}

/** 选项未指定时回退到第一行，保证显示值与生效值一致 */
export function effectiveTraitOption(table: TraitTable, chosen: string | undefined): string {
  return table.rows.some(r => r.name === chosen) ? chosen! : table.rows[0].name
}

/** 取法术名里的中文部分：「舞光术Dancing Lights」-> 「舞光术」 */
function cnPart(name: string): string {
  return name.replace(/[A-Za-z].*$/, '').replace(/\s+/g, '').trim()
}

/**
 * 在文本中查找法术速查里出现过的法术。
 * 只比中文名——规则书正文里的英文名常与速查不一致（如正文「舞光术Dancing light」
 * 对速查「舞光术Dancing Lights」），按全名匹配会漏掉。
 * 长名优先，避免「光亮术」把「光亮」类短名重复计入。
 */
function spellsIn(text: string, dict: SpellEntry[]): string[] {
  const flat = text.replace(/\s+/g, '')
  const hits: string[] = []
  for (const s of [...dict].sort((a, b) => cnPart(b.name).length - cnPart(a.name).length)) {
    const cn = cnPart(s.name)
    if (cn.length < 2) continue
    if (flat.includes(cn) && !hits.some(h => cnPart(h).includes(cn))) hits.push(s.name)
  }
  return hits
}

/**
 * 正文里出现法术名不等于「获得该法术」：种族特质「黑暗视觉」与同名法术撞名，
 * 精灵血系表格里「你的黑暗视觉提升至120尺」也只是描述而非授予。
 * 判据（按句子）：该句含授予类动词，或该句去掉法术名后几乎为空（表格里的裸法术名）。
 */
const GRANT_VERB = /习得|知晓|学会|获得|始终准备|可以施展|施展该|准备着/

function grantedIn(text: string, dict: SpellEntry[]): string[] {
  const sentences = text.split(/[。；;\n]/).filter(Boolean)
  const out: string[] = []
  for (const name of spellsIn(text, dict)) {
    const cn = cnPart(name)
    const hit = sentences.find(sen => sen.replace(/\s/g, '').includes(cn))
    if (!hit) continue
    const rest = hit.replace(/\s/g, '').replace(cn, '').replace(/[A-Za-z''\-.,()（）]/g, '')
    if (GRANT_VERB.test(hit) || rest.length <= 4) out.push(name)
  }
  return out
}

export function grantedSpells(c: CharacterChoices, loaded: LoadedEntities): GrantedSpell[] {
  // 种族/专长赋予的法术不受职业法术列表限制，故用未过滤的全表作词典
  const dict = loaded.spellList?.all ?? loaded.spellList?.spells ?? []
  if (dict.length === 0) return []
  const out: GrantedSpell[] = []
  const push = (name: string, source: string, level: number) => {
    const dup = out.find(g => g.name === name)
    if (dup) dup.level = Math.min(dup.level, level)
    else out.push({ name, source, level })
  }

  const collect = (traits: TraitEntry[], prefix: string, baseLevel = 1) => {
    for (const t of traits) {
      const table = parseTraitTable(t)
      if (table) {
        // 仅所选行生效；每列按其等级解锁
        const chosen = effectiveTraitOption(table, c.traitOptions[t.name])
        const row = table.rows.find(r => r.name === chosen)
        if (!row) continue
        row.cells.forEach((cell, i) => {
          const lv = table.levels[i] || baseLevel
          for (const n of grantedIn(cell, dict)) {
            push(n, `${prefix}·${t.name}（${chosen}）`, lv)
          }
        })
      } else {
        for (const n of grantedIn(t.desc, dict)) {
          if (cnPart(n) === cnPart(t.name)) continue // 与特质同名（如「黑暗视觉」），非法术授予
          push(n, `${prefix}·${t.name}`, baseLevel)
        }
      }
    }
  }

  collect(speciesTraits(loaded.species, c.subraceChoice), '种族')
  // 子职特性按该职业自己的等级解锁（兼职时与总等级不同）
  for (const inst of classInstances(c, loaded)) {
    if (!inst.subclass) continue
    for (const f of inst.subclass.features) {
      const lv = subclassFeatureLevel(f.name)
      if (lv > inst.level) continue
      // 职业等级 ≤ 总等级，故以职业等级标注不会被末尾的总等级过滤误删
      collect([f], `子职·${inst.subclass.nameCn}`, lv)
    }
  }
  for (const f of Object.values(activeFeats(c, loaded))) collect([f], '专长')

  return out.filter(g => g.level <= c.level).sort((a, b) => a.level - b.level)
}

// ponytail: 专长里「从法师列表中选择两道戏法」这类由玩家自选的法术无法从文本推出，
// 仍需在法术面板手动勾选；这里只带入写明了具体法术名的部分。
