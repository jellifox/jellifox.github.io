// 把仓库中的 GBK htm 规则书页面解析为结构化数据。
// 解析策略：DOMParser -> 带标记的纯文本（\x01..\x02 包裹加粗），再用正则提取。

import type {
  AbilityKey, BackgroundData, ClassData, ClassLevelRow, SkillKey,
  SpeciesData, SubclassData, SubraceEntry, TraitEntry,
} from '../types'
import {
  cnTextToSkills, cnToAbilities, parseCnInt, CN_NUM,
} from './mappings'

const B0 = '\x01'
const B1 = '\x02'

function parseDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** 把表格渲染成纯文本（无加粗标记）：每行单元格用 ｜ 连接，行间换行 */
function renderTablePlain(table: Element): string {
  return Array.from(table.querySelectorAll('tr'))
    .map(tr =>
      Array.from(tr.querySelectorAll('td, th'))
        .map(td => (td.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ｜ ')
    )
    .filter(Boolean)
    .join('\n')
}

/**
 * 把元素序列化为带标记文本：<br>/<p>/<li> 等转换行，加粗内容用 \x01..\x02 包裹。
 * opts.tables=true 时把表格渲染成纯文本（不丢内容，且不产生加粗段）——
 * 用于种族页里「精灵血系表格」这类把关键数据放进表格的特质。
 */
function markedText(node: Node, opts: { tables?: boolean } = {}): string {
  let out = ''
  const walk = (n: Node, bold: boolean) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent ?? '').replace(/[\r\n\t]+/g, ' ')
      out += bold ? B0 + t + B1 : t
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      out += '\n'
      return
    }
    if (tag === 'table') {
      out += opts.tables ? '\n' + renderTablePlain(el) + '\n' : '\n'
      return // 不递归进表格内部（避免表头 <strong> 变成特质标题）
    }
    const block = ['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'tr'].includes(tag)
    if (block) out += '\n'
    const isBold = bold || tag === 'b' || tag === 'strong'
    el.childNodes.forEach(c => walk(c, isBold))
    if (block) out += '\n'
  }
  walk(node, false)
  // 仅合并同一行内被拆开的加粗段（空格/制表），不跨换行——否则像
  // “矮人特质 Dwarf Traits<BR>生物类型：” 这种相邻加粗会被错误并成一段。
  return out
    .replace(new RegExp(`${B1}([ \\t]*)${B0}`, 'g'), '$1')
    .replace(/ +/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function plain(s: string): string {
  return s.replace(new RegExp(`[${B0}${B1}]`, 'g'), '').trim()
}

/** "矮人 Dwarf" -> { cn, en } */
function splitCnEn(title: string): { cn: string; en: string } {
  const t = plain(title).replace(/\s+/g, ' ').trim()
  const m = t.match(/^([^\sA-Za-z]+)\s*([A-Za-z][A-Za-z''\-: ]*)?$/)
  if (m) return { cn: m[1].trim(), en: (m[2] ?? '').trim() }
  return { cn: t, en: '' }
}

/**
 * 把带标记文本切成「加粗标题 + 描述」段。
 * 例如 \x01黑暗视觉Darkvision。\x02你拥有... -> { head: '黑暗视觉Darkvision。', body: '你拥有...' }
 */
interface BoldSegment {
  head: string
  body: string
}

function boldSegments(text: string): BoldSegment[] {
  const re = new RegExp(`${B0}([^${B1}]*)${B1}`, 'g')
  const segs: BoldSegment[] = []
  let last: BoldSegment | null = null
  let lastEnd = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (last) {
      last.body = text.slice(lastEnd, m.index)
      segs.push(last)
    } else if (segs.length === 0 && m.index > 0) {
      segs.push({ head: '', body: text.slice(0, m.index) })
    }
    last = { head: m[1].trim(), body: '' }
    lastEnd = m.index + m[0].length
  }
  if (last) {
    last.body = text.slice(lastEnd)
    segs.push(last)
  }
  for (const s of segs) s.body = s.body.replace(/\s*\n\s*/g, '\n').trim()
  return segs
}

function traitNameOf(head: string): string {
  return head.replace(/[。.．]\s*$/, '').replace(/\s+/g, ' ').trim()
}

/** 以句号结尾 = 单条特质的标题（而非区块/亚种小节标题） */
function isHeadingLike(head: string): boolean {
  return /[。．.]\s*$/.test(head)
}

// ---------- 种族 ----------

/** 种族页里属于「元信息」而非特质的加粗标题（2024 键值式或 MPMM 正文式都可能出现） */
const SPECIES_META_RE = /^(生物类型|生物种类|体型|尺寸|速度|属性值提升|属性值增加|年龄|寿命|阵营|语言|亚种|超龄|天性)/

function pageTitle(doc: Document): { cn: string; en: string } {
  const h = doc.querySelector('h1, h2, h3')
  if (h && (h.textContent ?? '').trim()) return splitCnEn(h.textContent ?? '')
  // 退回 <title> + 首个加粗大字标题
  const t = (doc.querySelector('title')?.textContent ?? '').trim()
  const firstBold = doc.querySelector('strong, b')
  const boldText = (firstBold?.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (boldText && t && boldText.includes(t)) return splitCnEn(boldText)
  return splitCnEn(t || boldText)
}

function sizesIn(text: string): string[] {
  const out: string[] = []
  for (const s of ['超巨型', '巨型', '大型', '中型', '小型', '微型']) {
    if (text.includes(s) && !out.includes(s)) out.push(s)
  }
  return out
}

export function parseSpecies(html: string, path: string): SpeciesData | null {
  const doc = parseDoc(html)
  const { cn, en } = pageTitle(doc)
  if (!cn) return null
  const text = markedText(doc.body, { tables: true })
  const flat = plain(text)

  // 2024 键值式：体型：中型(...)  速度：30尺
  const typeM = flat.match(/生物(?:类型|种类)[：:]\s*([^\n，。]+)/)
  const sizeM = flat.match(/体型[：:]\s*([^\n]+)/)
  const speedM = flat.match(/速度[：:]\s*(\d+)\s*尺/)

  let creatureType = typeM ? typeM[1].trim() : ''
  let sizeText = sizeM ? sizeM[1].trim() : ''
  let sizeOptions = sizesIn(sizeText)
  let speed = speedM ? parseInt(speedM[1], 10) : 0

  // 特质段扫描。一条特质 = 以 。结尾的加粗标题；正文里的行内加粗（如「精灵血系
  // 表格」）和表格文本会折叠进当前特质，避免在行内加粗处被截断、丢失后续内容。
  //
  // 「精灵血系」问题：血系子选项（暗裔精灵、高等精灵、林地精灵）也以 。结尾，会被
  // 误判为独立特质，导致父特质「精灵血系Elven Lineage」描述被截断。
  // 修复：先扫描 DOM，收集「主特性级」加粗标题（红色 #800000 或大字号），
  // 只有这些标题才能开新特质；其余以 。结尾的加粗（子选项）折叠进当前特质。
  const featureHeads = new Set<string>()
  for (const el of Array.from(doc.querySelectorAll('b, strong'))) {
    if (isFeatureHeading(el)) {
      featureHeads.add((el.textContent ?? '').replace(/\s+/g, ' ').trim())
    }
  }
  // 红标只有在「本身长得像特质标题」（以 。结尾）时才用于门控。
  // PHB2024 精灵页的红标是无 。的血系背景故事小节（卓尔/高等精灵/木精灵），
  // 真正的特质是普通 <b>——此时门控必须关闭，否则第二条起的特质全被降级折叠。
  const gateByRed = Array.from(featureHeads).some(h => /[。．.]\s*$/.test(h))

  // 亚种（Subrace）识别：
  // 谦卑林等扩展把「共通特质 + 若干亚种」放在同一页，结构为
  //   红标「XX特质 XX Traits」 -> 共通特质…  红标「昏鸦族 Dusk Corvum」 -> 亚种特质…
  // 因此规则是：出现在「特质」区块标记之后的红标题即为一个亚种。
  // 该标记之前的红标题是背景故事（如 PHB2024 精灵页的卓尔/高等精灵/木精灵），不算亚种。
  const traits: TraitEntry[] = []
  const subraces: SubraceEntry[] = []
  let sawTraitsMarker = false
  let currentSub: SubraceEntry | null = null
  const sink = () => (currentSub ? currentSub.traits : traits)

  let abilityBonusText = ''
  let current: TraitEntry | null = null
  for (const seg of boldSegments(text)) {
    const headPlain = plain(seg.head).replace(/\s+/g, ' ').trim()
    const rawName = traitNameOf(seg.head)
    // 跳过区块标题（如 “矮人特质 Dwarf Traits””XX特质”），它不是单条特质
    if (/特质\s*[A-Za-z''\- ]*$|Traits?\s*$/.test(rawName)) {
      if (featureHeads.has(headPlain) || featureHeads.has(rawName)) sawTraitsMarker = true
      current = null
      continue
    }
    // 特质区块之后的红标题 = 亚种起点
    if (sawTraitsMarker && !isHeadingLike(headPlain) &&
        (featureHeads.has(headPlain) || featureHeads.has(rawName))) {
      currentSub = { name: rawName, desc: seg.body.trim(), traits: [], abilityBonusText: '' }
      subraces.push(currentSub)
      current = null
      continue
    }
    if (SPECIES_META_RE.test(rawName)) {
      if (/^体型|^尺寸/.test(rawName)) {
        if (sizeOptions.length === 0) sizeOptions = sizesIn(seg.body)
        if (!sizeText) sizeText = seg.body.split('\n')[0]
      } else if (/^速度/.test(rawName)) {
        if (!speed) {
          const m = seg.body.match(/(\d+)\s*尺/)
          if (m) speed = parseInt(m[1], 10)
        }
      } else if (/^属性值/.test(rawName)) {
        // 该段不进特质列表（2024 规则下种族不给加值），但 2014/第三方种族的
        // 加值原文要留存，供 speciesAbilityBonus 解析后计入总值。
        if (currentSub) currentSub.abilityBonusText += ' ' + seg.body
        else abilityBonusText += ' ' + seg.body
      } else if (/^生物/.test(rawName)) {
        if (!creatureType) {
          const m = seg.body.match(/类人|不死|构装|精类|魔鬼|天界/)
          creatureType = m ? m[0] : seg.body.slice(0, 12)
        }
      }
      current = null
      continue // 元信息不进特质列表（旧版种族的属性值提升按 2024 规则忽略）
    }
    // 真正的特质标题以 。结尾；否则是行内强调/表格标题/续写，折叠进当前特质
    const isHeading = /[。．.]\s*$/.test(headPlain) && rawName.length > 1
    // 只有「主特性级」加粗（或页面无颜色区分时全部）才开新条目；
    // 子选项加粗（如精灵三血系）折叠进父特质，避免描述被截断。
    const isTopLevel = isHeading && (
      !gateByRed                       // 无红标或红标只是小节标题：保持原有行为
      || featureHeads.has(headPlain)   // 本段确认为主特性
      || featureHeads.has(rawName)     // 兼容 。在 <b> 外的排版
      || current === null              // 第一条特质（section 刚重置）
    )
    if (isTopLevel) {
      current = { name: rawName, desc: seg.body }
      sink().push(current)
    } else if (current) {
      const body = seg.body ?? ''
      if (isHeading) {
        // 子选项标题：另起一行折叠（加粗标题 + 正文），保留完整描述
        current.desc += body.length ? `\n${headPlain}\n${body}` : `\n${headPlain}`
      } else {
        // 带表格的折叠段（含 ｜ 分隔）另起一行，避免标题与表头粘连
        current.desc += body.includes(' ｜ ') ? `\n${headPlain}\n${body}` : headPlain + body
      }
    }
  }
  for (const t of traits) t.desc = t.desc.replace(/\n{2,}/g, '\n').trim()
  for (const s of subraces) {
    for (const t of s.traits) t.desc = t.desc.replace(/\n{2,}/g, '\n').trim()
  }

  if (sizeOptions.length === 0) sizeOptions = ['中型']
  if (!speed) speed = 30
  if (!creatureType) creatureType = '类人'

  // 简介：第一段非键值正文
  let desc = ''
  for (const line of flat.split('\n')) {
    const t = line.trim()
    if (t.length > 40 && !t.includes('：') && !/特质|Traits/.test(t)) {
      desc = t
      break
    }
  }

  return {
    id: path,
    nameCn: cn,
    nameEn: en,
    creatureType,
    sizeOptions,
    sizeNote: sizeText,
    speed,
    traits,
    subraces,
    abilityBonusText: abilityBonusText.trim(),
    desc,
  }
}

// ---------- 背景 ----------

function parseEquipOptions(s: string): string[] {
  const opts: string[] = []
  const re = /[(（]([A-CＡ-Ｃ])[)）]\s*([^；;]+?)(?=[；;]|[或]\s*[(（][A-CＡ-Ｃ][)）]|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    opts.push(`(${m[1]}) ${m[2].replace(/[。\s]+$/, '').trim()}`)
  }
  if (opts.length === 0 && s.trim()) opts.push(s.trim())
  return opts
}

export function parseBackground(html: string, path: string): BackgroundData | null {
  const doc = parseDoc(html)
  const { cn, en } = pageTitle(doc)
  if (!cn) return null
  const text = markedText(doc.body)
  const flat = plain(text)

  const abilityM = flat.match(/属性值[：:]\s*([^\n]+)/)
  const featM = flat.match(/专长[：:]\s*([^\n]+)/)
  const skillM = flat.match(/技能熟练[：:]\s*([^\n]+)/)
  const toolM = flat.match(/工具熟练[：:]\s*([^\n]+)/)
  const equipM = flat.match(/装备[：:]\s*([^\n]+)/)

  if (!abilityM && !skillM) return null // 不是标准背景页（如“背景详述”）

  const abilities: AbilityKey[] = abilityM ? cnToAbilities(abilityM[1]) : []
  const skills: SkillKey[] = skillM ? cnTextToSkills(skillM[1]) : []

  let desc = ''
  for (const line of flat.split('\n')) {
    const t = line.trim()
    if (t.length > 30 && !t.includes('：')) {
      desc = t
      break
    }
  }

  return {
    id: path,
    nameCn: cn,
    nameEn: en,
    abilities,
    feat: featM ? featM[1].trim() : '',
    skills,
    skillsRaw: skillM ? skillM[1].trim() : '',
    tool: toolM ? toolM[1].trim() : '',
    equipmentOptions: equipM ? parseEquipOptions(equipM[1]) : [],
    desc,
  }
}

// ---------- 职业 ----------

function cellText(td: Element): string {
  return (td.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** 解析职业核心特质表 */
function parseCoreTable(doc: Document): Record<string, string> {
  const out: Record<string, string> = {}
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'))
    let hits = 0
    const kv: Record<string, string> = {}
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td, th'))
      if (tds.length < 2) continue
      const label = cellText(tds[0])
      const value = tds.slice(1).map(cellText).join(' ')
      kv[label] = value
      if (/主要属性|生命值骰|豁免熟练|技能熟练|武器熟练|护甲受训|起始装备/.test(label)) hits++
    }
    if (hits >= 3) {
      for (const [k, v] of Object.entries(kv)) {
        if (/主要属性/.test(k)) out.primary = v
        else if (/生命值骰|生命骰/.test(k)) out.hitDie = v
        else if (/豁免熟练/.test(k)) out.saves = v
        else if (/技能熟练/.test(k)) out.skills = v
        else if (/武器熟练/.test(k)) out.weapons = v
        else if (/护甲受训|护甲熟练/.test(k)) out.armor = v
        else if (/起始装备/.test(k)) out.equipment = v
      }
      return out
    }
  }
  return out
}

/** 解析职业特性表（含法术位列）。列位置按表头名称定位，兼容 2014 老排版
 *（如血猎手的「所知特性」列不在第 3 列）。 */
function parseLevelTable(doc: Document): ClassLevelRow[] {
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'))
    if (rows.length < 5) continue
    const headerTexts: string[] = []
    const dataRows: Element[] = []
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td, th'))
      if (tds.length === 0) continue
      const first = cellText(tds[0])
      if (/^\d+(st|nd|rd|th)?$/.test(first)) {
        dataRows.push(tr)
      } else if (dataRows.length === 0) {
        for (const td of tds) {
          const t = cellText(td)
          if (t && !/每环法术位|—+/.test(t)) headerTexts.push(t)
        }
      }
    }
    if (dataRows.length < 10 || !headerTexts.some(t => t.includes('等级'))) continue

    const levelIdx = headerTexts.findIndex(t => t.includes('等级'))
    const pbIdx = headerTexts.findIndex(t => t.includes('熟练加值'))
    const featIdx = headerTexts.findIndex(t => /特性/.test(t))

    const out: ClassLevelRow[] = []
    for (const tr of dataRows) {
      const tds = Array.from(tr.querySelectorAll('td, th'))
      if (tds.length < 2) continue
      const level = parseInt(cellText(tds[levelIdx >= 0 ? levelIdx : 0]), 10)
      if (!Number.isFinite(level)) continue
      const pbM = pbIdx >= 0 && tds[pbIdx] ? cellText(tds[pbIdx]).match(/\d+/) : null
      const row: ClassLevelRow = {
        level,
        pb: pbM ? parseInt(pbM[0], 10) : 2 + Math.floor((level - 1) / 4),
        features:
          featIdx >= 0 && tds[featIdx]
            ? cellText(tds[featIdx])
                .split(/[，,、]/)
                .map(s => s.trim())
                .filter(s => s && !/^[—\-–]+$/.test(s))
            : [],
        extras: {},
      }
      headerTexts.forEach((name, i) => {
        if (i === levelIdx || i === pbIdx || i === featIdx) return
        const td = tds[i]
        if (!td) return
        const v = cellText(td)
        row.extras[name] = v
        const num = /^[—\-–]*$/.test(v) ? 0 : parseInt(v.replace(/\D+/g, ''), 10) || 0
        const ringM = name.match(/^([一二三四五六七八九])环$/)
        if (ringM) {
          if (num > 0) {
            row.slots = row.slots ?? {}
            row.slots[CN_NUM[ringM[1]]] = num
          }
        } else if (/^戏法/.test(name)) row.cantrips = num
        else if (/准备法术|已知法术/.test(name)) row.preparedSpells = num
        else if (/法术位环阶|环阶/.test(name)) {
          const lv = parseCnInt(v)
          if (lv && row.pactSlots) row.pactSlots.level = lv
          else if (lv) row.pactSlots = { count: 0, level: lv }
        } else if (/^法术位$/.test(name.replace(/\s/g, ''))) {
          if (row.pactSlots) row.pactSlots.count = num
          else row.pactSlots = { count: num, level: 1 }
        }
      })
      out.push(row)
    }
    if (out.length >= 10) return out
  }
  return []
}

/** 2014 老排版职业页的文本式核心信息（生命骰/豁免/技能写在正文段落里） */
function parseTextCore(flat: string): Record<string, string> {
  const out: Record<string, string> = {}
  const hd = flat.match(/生命值?骰[：:][^\n]*?[dDＤ]\s*(\d+)/)
  if (hd) out.hitDie = `D${hd[1]}`
  const saveM = flat.match(/豁免(?:熟练)?[：:]\s*([^\n]+)/)
  if (saveM) out.saves = saveM[1]
  const skillM = flat.match(/技能(?:熟练)?[：:]\s*([^\n]+)/)
  if (skillM) out.skills = skillM[1]
  const armorM = flat.match(/护甲[：:]\s*([^\n]+)/)
  if (armorM) out.armor = armorM[1]
  const weapM = flat.match(/武器[：:]\s*([^\n]+)/)
  if (weapM) out.weapons = weapM[1]
  // 快速建卡建议里的主属性：“把力量或敏捷作为你最高的属性”
  const primM = flat.match(/[把将]\s*([^\n，。]{2,12})\s*作为你?的?最高/)
  if (primM) out.primary = primM[1]
  return out
}

export function parseClass(html: string, path: string): ClassData | null {
  const doc = parseDoc(html)
  const { cn, en } = pageTitle(doc)
  if (!cn) return null
  const text = markedText(doc.body)
  const flat = plain(text)

  // 优先用 2024 式核心特质表；没有时退回 2014 式正文段落（如第三方血猎手）
  let core = parseCoreTable(doc)
  if (!core.hitDie) {
    core = { ...parseTextCore(flat), ...core }
  }
  if (!core.hitDie) return null
  const levels = parseLevelTable(doc)

  const hitDieM = core.hitDie.match(/[DdＤ]\s*(\d+)/)
  const skillsRaw = core.skills ?? ''
  let skillChoiceCount = 2
  let skillChoices: SkillKey[] | 'any' = 'any'
  const anyM = skillsRaw.match(/任选\s*(\d+|[一二三四五])\s*项/)
  const chooseM = skillsRaw.match(/(?:选择|选取)\s*(\d+|[一二三四五])\s*项/)
  if (anyM) {
    skillChoiceCount = parseCnInt(anyM[1]) ?? 3
    skillChoices = 'any'
  } else if (chooseM) {
    skillChoiceCount = parseCnInt(chooseM[1]) ?? 2
    skillChoices = cnTextToSkills(skillsRaw.replace(/(?:选择|选取)\s*(\d+|[一二三四五])\s*项[：:]?/, ''))
  } else {
    skillChoices = cnTextToSkills(skillsRaw)
    skillChoiceCount = Math.min(2, skillChoices.length)
  }

  const spellAbilityM = flat.match(/施法属性是(力量|敏捷|体质|智力|感知|魅力)/)

  const flavorM = doc.querySelector('p.sum')
  let flavor = flavorM ? (flavorM.textContent ?? '').trim() : ''
  if (!flavor) {
    for (const line of flat.split('\n')) {
      if (line.trim().length > 40 && !line.includes('：')) {
        flavor = line.trim()
        break
      }
    }
  }

  return {
    id: path,
    nameCn: cn,
    nameEn: en,
    flavor,
    primaryAbility: core.primary ?? '',
    hitDie: hitDieM ? parseInt(hitDieM[1], 10) : 8,
    saves: cnToAbilities(core.saves ?? ''),
    skillChoiceCount,
    skillChoices,
    skillChoicesRaw: skillsRaw,
    weaponProf: core.weapons ?? '',
    armorTraining: core.armor ?? '',
    equipmentOptions: parseEquipOptions(core.equipment ?? ''),
    spellAbility: spellAbilityM ? cnToAbilities(spellAbilityM[1])[0] ?? null : null,
    levels,
    subclasses: [],
  }
}

// ---------- 子职 ----------

interface RichSeg {
  head: string // 加粗标题文本
  red: boolean // 是否为「主特性」级标题（深红 #800000 或大字号）
  body: string // 该标题后、下一标题前的正文
}

/** 标题元素是否为主特性级（规则书用深红 #800000 / 大字号区分主特性与子项） */
function isFeatureHeading(el: Element): boolean {
  const html = el.outerHTML
  if (/color\s*=\s*["']?#?800000/i.test(html)) return true
  if (/size\s*=\s*["']?[4-9]/i.test(html)) return true
  let p: Element | null = el.parentElement
  for (let i = 0; p && i < 3; i++, p = p.parentElement) {
    if ((p.getAttribute('color') ?? '').toLowerCase().includes('800000')) return true
  }
  return false
}

/** DOM 顺序遍历，产出 {加粗标题, 是否主特性红标, 其后正文} 段（表格整体跳过） */
function richSegments(root: Node): RichSeg[] {
  const segs: RichSeg[] = [{ head: '', red: false, body: '' }]
  const append = (t: string) => {
    segs[segs.length - 1].body += t
  }
  const walk = (n: Node) => {
    n.childNodes.forEach(c => {
      if (c.nodeType === Node.TEXT_NODE) {
        append((c.textContent ?? '').replace(/[\r\n\t]+/g, ' '))
        return
      }
      if (c.nodeType !== Node.ELEMENT_NODE) return
      const el = c as Element
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') return append('\n')
      if (tag === 'table') return append('\n') // 表格不参与特性切分
      if (tag === 'strong' || tag === 'b') {
        const head = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (head) segs.push({ head, red: isFeatureHeading(el), body: '' })
        else el.childNodes.forEach(walk)
        return
      }
      const block = ['p', 'div', 'li', 'ul', 'ol', 'tr', 'h1', 'h2', 'h3', 'h4'].includes(tag)
      if (block) append('\n')
      walk(el)
      if (block) append('\n')
    })
  }
  walk(root)
  for (const s of segs) {
    s.body = s.body.replace(/ {2,}/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim()
  }
  return segs
}

const HEAD_LEVEL_RE = /^(\d+)\s*级\s*[：:]/
function headLevel(head: string): number | null {
  const m = head.match(HEAD_LEVEL_RE)
  return m ? parseInt(m[1], 10) : null
}
/** 仅在正文开头（前 24 字）寻找该特性自身的等级，如 “第7级起 / 在2级时 / 从 11 级” */
function bodyLevel(body: string): number | null {
  const m = body.slice(0, 24).match(/第?\s*(\d+)\s*级/)
  return m ? parseInt(m[1], 10) : null
}
/** 取标题里的中文主名（截到首个英文/分隔符前），用于与页面标题比对 */
function headChinese(head: string): string {
  return head.replace(/[A-Za-z''\-—.,()（）:：\s].*$/, '').trim()
}

export function parseSubclass(html: string, path: string): SubclassData | null {
  const doc = parseDoc(html)
  const { cn, en } = pageTitle(doc)
  if (!cn) return null
  const titleCn = cn.replace(/[（(].*$/, '').trim()

  const segs = richSegments(doc.body)
  const features: TraitEntry[] = []
  let current: TraitEntry | null = null

  const foldInto = (f: TraitEntry, head: string, body: string) => {
    const sub = body ? `${head}\n${body}` : head
    f.desc = f.desc ? `${f.desc}\n\n${sub}` : sub
  }

  for (const seg of segs) {
    const head = seg.head
    if (!head) continue
    if (/^[—\-－–\s]+$/.test(head)) continue // 分隔符
    if (headChinese(head) === titleCn) continue // 页面标题

    const lvHead = headLevel(head)
    const lvBody = bodyLevel(seg.body)

    // 主特性：红标 + 自带等级（标题“N级：”或正文开头“第N级起”）
    if (seg.red && (lvHead != null || lvBody != null)) {
      const lv = lvHead ?? lvBody!
      current = { name: lvHead != null ? head : `${lv}级：${head}`, desc: seg.body }
      features.push(current)
    } else if (current) {
      // 子项/恩惠选项/区块小标题（如 邪狱使「禁令恩惠」、血猎手徒手打击子特性）
      // 一律折叠进当前主特性，而不是各自成为独立词条
      foldInto(current, head, seg.body)
    }
    // 开篇风味（红标无等级且尚无主特性）忽略
  }

  // 兜底：没有任何主特性时，把每个像样的加粗段当作一条特性（避免空列表）
  if (features.length === 0) {
    for (const seg of segs) {
      const head = seg.head
      if (!head || seg.body.length < 30) continue
      if (headChinese(head) === titleCn) continue
      if (/特性\s*$|Features?\s*$|目录|表格/.test(head)) continue
      const lv = headLevel(head) ?? bodyLevel(seg.body) ?? 3
      features.push({ name: headLevel(head) != null ? head : `${lv}级：${head}`, desc: seg.body })
    }
  }

  const sum = doc.querySelector('p.sum')
  const desc = sum ? (sum.textContent ?? '').trim() : ''

  return { id: path, nameCn: cn, nameEn: en, desc, features }
}

// ---------- 专长页（一页含多个专长，红标 #800000 为专长名） ----------

export function parseFeatPage(html: string): TraitEntry[] {
  const doc = parseDoc(html)
  const { cn: titleCn } = pageTitle(doc)
  const segs = richSegments(doc.body)
  const feats: TraitEntry[] = []
  let current: TraitEntry | null = null

  for (const seg of segs) {
    if (!seg.head) continue
    if (/^[—\-－–\s]+$/.test(seg.head)) continue
    if (headChinese(seg.head) === titleCn) continue // 页面标题
    if (seg.red) {
      current = { name: traitNameOf(seg.head), desc: seg.body }
      feats.push(current)
    } else if (current) {
      // 专长子项（属性值提升。/复选。等）折叠进当前专长
      current.desc += seg.body ? `\n${seg.head}${seg.body}` : `\n${seg.head}`
    }
  }
  // 兜底：无红标排版的页面（部分第三方书），退回「。结尾加粗 = 专长名」
  if (feats.length === 0) {
    for (const seg of segs) {
      if (!seg.head || seg.body.length < 30) continue
      if (headChinese(seg.head) === titleCn) continue
      if (/[。．.]\s*$/.test(seg.head)) feats.push({ name: traitNameOf(seg.head), desc: seg.body })
    }
  }
  return feats.filter(f => f.desc.length >= 10)
}

/** 子职特性标题里的等级，如 “3级：快手...” -> 3 */
export function subclassFeatureLevel(name: string): number {
  const m = name.match(/^(\d+)\s*级/)
  return m ? parseInt(m[1], 10) : 3
}

// ---------- 法术速查 ----------

export interface ParsedSpellEntry {
  ring: number
  school: string
  name: string
  source: string
  classes: string[]
  castingTime: string
  components: string
  ritual: boolean
  concentration: boolean
}

const RING_TITLES: Record<string, number> = {
  戏法: 0, 一环: 1, 二环: 2, 三环: 3, 四环: 4,
  五环: 5, 六环: 6, 七环: 7, 八环: 8, 九环: 9,
}

/** 万法大全速查表的职业列用单字缩写 */
const SPELL_CLASS_CN: Record<string, string> = {
  诗: '吟游诗人', 牧: '牧师', 德: '德鲁伊', 帕: '圣武士', 软: '游侠',
  术: '术士', 锁: '魔契师', 法: '法师', 械: '奇械师',
}

/**
 * 解析 速查/法术速查/*.html（万法大全速查表）。
 * 该页是一张总表，列为：法术名 环阶 学派 职业 时间 言语 姿势 材料 仪式 专注 来源。
 * 仓库早期是「每职业一页」的结构，现已改为总表，故按列解析并保留职业信息供筛选。
 */
export function parseSpellList(html: string): ParsedSpellEntry[] {
  const doc = parseDoc(html)
  const out: ParsedSpellEntry[] = []
  const yes = (v: string) => !!v && !/^[×xX✗－-]$/.test(v.trim())

  for (const tr of Array.from(doc.querySelectorAll('tr'))) {
    const td = Array.from(tr.querySelectorAll('td, th'))
      .map(c => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
    if (td.length < 11) continue
    const ring = RING_TITLES[td[1].replace(/\s/g, '')]
    if (ring == null) continue // 表头或异常行

    const components = ['言语', '姿势', '材料']
      .map((_, i) => (yes(td[5 + i]) ? td[5 + i] : ''))
      .filter(Boolean)
      .join('/')

    out.push({
      ring,
      school: td[2],
      name: td[0],
      source: td[10],
      classes: td[3].split(/\s+/).filter(Boolean)
        .map(t => SPELL_CLASS_CN[t]).filter((x): x is string => !!x),
      castingTime: td[4],
      components,
      ritual: yes(td[8]),
      concentration: yes(td[9]),
    })
  }
  return out
}

