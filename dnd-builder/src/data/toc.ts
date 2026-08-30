// 解析 不全书.wcp（WinCHM 工程文件，UTF-16）中的目录树。
// 「本书速查」章节就是全书聚合索引：
//   职业速查  -> 所有职业（含扩展/第三方）及其全部子职
//   起源速查  -> 2024背景（按来源书分组）+ 种族（按来源书分组）
//   法术速查  -> 每个施法职业的全书法术列表

export interface TocNode {
  title: string
  url: string // 仓库内路径（已把 \ 转为 /），可为空（纯分组节点）
  level: number
  children: TocNode[]
}

export interface IndexEntry {
  title: string
  url: string
  source: string // 来源书（缩写或书名）
}

export interface ClassIndexEntry extends IndexEntry {
  subclasses: IndexEntry[]
  // 职业的「可选资源池」（超魔法、魔能祈唤、血咒、禁令恩惠、战技等），
  // 它们是职业内的菜单式选项，不是子职，单独归类。
  optionalResources: IndexEntry[]
}

export interface GroupedIndex {
  group: string
  entries: IndexEntry[]
}

export interface BookIndex {
  classes: ClassIndexEntry[]
  speciesGroups: GroupedIndex[]
  backgroundGroups: GroupedIndex[]
  spellLists: IndexEntry[] // 每职业法术速查页
  featPages: GroupedIndex[] // 专长速查：每页含多个专长，按 L2 分类（核心/扩展/种族/战役…）分组
}

function parseEntries(wcpText: string): { title: string; url: string; level: number }[] {
  const fields = new Map<number, { title?: string; url?: string; level?: number }>()
  const re = /TitleList\.(Title|Url|Level)\.(\d+)=(.*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(wcpText))) {
    const idx = parseInt(m[2], 10)
    const f = fields.get(idx) ?? {}
    const val = m[3].replace(/\r$/, '')
    if (m[1] === 'Title') f.title = val
    else if (m[1] === 'Url') f.url = val.replace(/\\/g, '/')
    else f.level = parseInt(val, 10)
    fields.set(idx, f)
  }
  const out: { title: string; url: string; level: number }[] = []
  for (let i = 0; fields.has(i); i++) {
    const f = fields.get(i)!
    out.push({ title: f.title ?? '', url: f.url ?? '', level: f.level ?? 0 })
  }
  return out
}

/** 取 entries[start] 之后所有 level 更深的连续条目（即其子树） */
function subtree(
  entries: { title: string; url: string; level: number }[],
  start: number
): { title: string; url: string; level: number }[] {
  const base = entries[start].level
  const out: { title: string; url: string; level: number }[] = []
  for (let i = start + 1; i < entries.length && entries[i].level > base; i++) {
    out.push(entries[i])
  }
  return out
}

const SKIP_RE = /分割线|兼职规则|法术列表|超魔法选项|魔能祈唤选项|武器精通选项|定制角色/

/** 分隔线/分隔符节点（标题为纯破折号，或指向 分隔符.htm / 关于第三方.htm） */
function isSeparator(title: string, url: string): boolean {
  return /分割线|分隔符/.test(title) || /分隔符\.htm$|关于第三方\.htm$/i.test(url) || /^[—\-－–\s]+$/.test(title)
}

/**
 * 判断职业速查下的某个 L3 子项属于哪一类：
 * - separator：分隔线，丢弃
 * - spelllist：职业法术列表页，丢弃（法术由法术速查负责）
 * - optional：职业可选资源池（菜单式选项），归入 optionalResources
 * - subclass：真正的子职
 */
function classChildKind(title: string, url: string): 'separator' | 'spelllist' | 'optional' | 'subclass' {
  if (isSeparator(title, url)) return 'separator'
  if (/法术列表/.test(title)) return 'spelllist'
  // 这些是「从列表里挑选的职业资源」，不是子职：
  // 超魔法选项 / 魔能祈唤选项 / 禁令恩惠选项 / 战技选项 / 武器精通选项 …、血咒
  if (/选项/.test(title) || /血咒/.test(title)) return 'optional'
  return 'subclass'
}

/** 从标题中提取来源标注，如 “剑舞学院（XGE）” -> XGE；否则取 url 第一段书名 */
function sourceOf(title: string, url: string): string {
  const m = title.match(/[（(]([^（）()]+)[)）]\s*$/)
  if (m) return m[1]
  const seg = url.split('/')
  if (seg.length > 1) {
    return seg[0] === '第三方' && seg.length > 2 ? `第三方·${seg[1]}` : seg[0]
  }
  return ''
}

function cleanTitle(title: string): string {
  return title.replace(/[（(][^（）()]*[)）]\s*$/, '').trim()
}

export function parseBookIndex(wcpText: string): BookIndex {
  const entries = parseEntries(wcpText)

  const idx: BookIndex = {
    classes: [], speciesGroups: [], backgroundGroups: [], spellLists: [], featPages: [],
  }

  // ---- 职业速查 ----
  const classRootI = entries.findIndex(e => e.title === '职业速查' && e.level === 1)
  if (classRootI >= 0) {
    const sub = subtree(entries, classRootI)
    let current: ClassIndexEntry | null = null
    for (const e of sub) {
      if (e.level === 2) {
        // 没有 url 的 level-2（如 额外职业选项 分组）跳过
        if (!e.url || isSeparator(e.title, e.url)) {
          current = null
          continue
        }
        current = {
          title: cleanTitle(e.title),
          url: e.url,
          source: sourceOf(e.title, e.url),
          subclasses: [],
          optionalResources: [],
        }
        idx.classes.push(current)
      } else if (e.level === 3 && current && e.url) {
        const kind = classChildKind(e.title, e.url)
        if (kind === 'separator' || kind === 'spelllist') continue
        const entry: IndexEntry = {
          title: cleanTitle(e.title),
          url: e.url,
          source: sourceOf(e.title, e.url),
        }
        if (kind === 'optional') current.optionalResources.push(entry)
        else current.subclasses.push(entry)
      }
    }
  }

  // ---- 起源速查 ----
  const originRootI = entries.findIndex(e => e.title === '起源速查' && e.level === 1)
  if (originRootI >= 0) {
    const sub = subtree(entries, originRootI)
    // 其下 level-2 节点：2024背景 / 2014背景 / 种族
    for (let i = 0; i < sub.length; i++) {
      const node = sub[i]
      if (node.level !== 2) continue
      const groupKind = node.title
      if (groupKind !== '2024背景' && groupKind !== '种族') continue
      const target = groupKind === '种族' ? idx.speciesGroups : idx.backgroundGroups

      let currentGroup: GroupedIndex | null = null
      let parentPrefix = ''
      let parentLevel = 0
      for (let j = i + 1; j < sub.length && sub[j].level > 2; j++) {
        const e = sub[j]
        if (SKIP_RE.test(e.title)) {
          if (e.level === 3) currentGroup = null
          continue
        }
        if (e.level === 3) {
          currentGroup = { group: cleanTitle(e.title), entries: [] }
          target.push(currentGroup)
          parentPrefix = ''
          parentLevel = 0
        } else if (currentGroup) {
          // level 4 为条目；level 5+ 为亚种（带上父级前缀）
          if (e.level === 4) {
            parentPrefix = cleanTitle(e.title)
            parentLevel = 4
            if (e.url) {
              currentGroup.entries.push({
                title: cleanTitle(e.title),
                url: e.url,
                source: currentGroup.group,
              })
            }
          } else if (e.level > 4 && parentLevel === 4 && e.url) {
            currentGroup.entries.push({
              title: `${parentPrefix}·${cleanTitle(e.title)}`,
              url: e.url,
              source: currentGroup.group,
            })
          }
        }
      }
    }
    // 去掉空分组
    idx.speciesGroups = idx.speciesGroups.filter(g => g.entries.length > 0)
    idx.backgroundGroups = idx.backgroundGroups.filter(g => g.entries.length > 0)
  }

  // ---- 专长速查 ----
  const featRootI = entries.findIndex(e => e.title === '专长速查' && e.level === 1)
  if (featRootI >= 0) {
    let currentGroup: GroupedIndex | null = null
    let l3Title = ''
    for (const e of subtree(entries, featRootI)) {
      if (isSeparator(e.title, e.url)) continue
      if (e.level === 2) {
        currentGroup = { group: cleanTitle(e.title), entries: [] }
        idx.featPages.push(currentGroup)
        l3Title = ''
        if (!e.url) continue
        // L2 自带页面（如 核心专长 -> 专长概述）跳过概述类页面
        if (!/概述|关于/.test(e.url)) {
          currentGroup.entries.push({ title: cleanTitle(e.title), url: e.url, source: currentGroup.group })
        }
      } else if (currentGroup && e.url) {
        if (e.level === 3) l3Title = cleanTitle(e.title)
        // 深层条目（如 费伦专长·起源专长）带上父级前缀，避免同名混淆
        const title = e.level > 3 && l3Title ? `${l3Title}·${cleanTitle(e.title)}` : cleanTitle(e.title)
        currentGroup.entries.push({ title, url: e.url, source: currentGroup.group })
      }
    }
    idx.featPages = idx.featPages.filter(g => g.entries.length > 0)
  }

  // ---- 法术速查 ----
  const spellRootI = entries.findIndex(e => e.title === '法术速查' && e.level === 1)
  if (spellRootI >= 0) {
    for (const e of subtree(entries, spellRootI)) {
      // 仓库早期是「每职业一页」（XX法术速查.html），现为 速查/法术速查/ 下的总表，
      // 故按目录匹配，两种结构都能识别。
      if (e.url && /(^|\/)速查\/法术速查\/|法术速查\.html?$/.test(e.url)) {
        idx.spellLists.push({ title: e.title, url: e.url, source: '' })
      }
    }
  }

  return idx
}
