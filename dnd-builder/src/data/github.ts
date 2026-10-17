// 实时拉取 DND5eChm/DND5e_chm 仓库资源的获取层。
// 流程：查询分支最新 commit -> 拉取 不全书.wcp 解析「本书速查」目录树作为全书索引
// -> 选中具体职业/种族/背景/法术列表时按需拉取对应页面（GBK 解码）
// -> 一切缓存均按 commit SHA 失效，保证内容跟随仓库实时更新。

export const REPO = 'DND5eChm/DND5e_chm'
export const DEFAULT_BRANCH = 'main'
export const WCP_PATH = '不全书.wcp'

const API = `https://api.github.com/repos/${REPO}`
const RAW = `https://raw.githubusercontent.com/${REPO}`

export interface FetchProgress {
  phase: 'meta' | 'index' | 'page' | 'done'
  message: string
}

export interface BranchInfo {
  sha: string
  commitDate: string
}

export async function getBranchInfo(branch: string): Promise<BranchInfo> {
  const res = await fetch(`${API}/branches/${encodeURIComponent(branch)}`)
  if (!res.ok) throw new Error(`GitHub API 错误（${res.status}）：无法获取分支信息，可能触发了速率限制`)
  const data = await res.json()
  return {
    sha: data.commit.sha as string,
    commitDate: (data.commit.commit?.committer?.date ?? '') as string,
  }
}

/** 解码 GBK / GB2312 / UTF-8 的 htm 文件 */
function decodeHtml(buf: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 512))
  const m = head.match(/charset\s*=\s*["']?([\w-]+)/i) || head.match(/coding:\s*([\w-]+)/i)
  let enc = (m ? m[1] : 'gb18030').toLowerCase()
  if (enc === 'gb2312' || enc === 'gbk') enc = 'gb18030'
  try {
    return new TextDecoder(enc).decode(buf)
  } catch {
    return new TextDecoder('gb18030').decode(buf)
  }
}

// 并发上限：一次性并发十几个请求（如兼职选择器载入全部职业）会被 raw.githubusercontent.com
// 限流，大量请求直接失败。排队后最多同时 MAX_CONCURRENT 个。
const MAX_CONCURRENT = 4
let active = 0
const queue: (() => void)[] = []

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>(r => queue.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    queue.shift()?.()
  }
}

async function fetchRawBuffer(ref: string, path: string): Promise<ArrayBuffer> {
  const url = `${RAW}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`
  return withSlot(async () => {
    // 网络层瞬断（TypeError: Failed to fetch）或 429/5xx 时退避重试至多两次；404 等确定性错误不重试
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url)
        if (res.ok) return res.arrayBuffer()
        if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
          continue
        }
        throw new Error(`下载失败（${res.status}）：${path}`)
      } catch (e) {
        if (attempt < 2 && e instanceof TypeError) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
          continue
        }
        throw e
      }
    }
  })
}

/** 拉取并解码一个 htm/html 页面 */
export async function fetchPage(ref: string, path: string): Promise<string> {
  return decodeHtml(await fetchRawBuffer(ref, path))
}

/** 拉取 wcp 工程文件（UTF-16） */
export async function fetchWcp(ref: string): Promise<string> {
  const buf = await fetchRawBuffer(ref, WCP_PATH)
  return new TextDecoder('utf-16').decode(buf)
}

// ---------- 按 SHA 失效的 localStorage 缓存 ----------

export const PARSER_VERSION = 16
const PREFIX = 'dnd5r-builder'

function cacheKey(kind: string): string {
  return `${PREFIX}:${kind}`
}

interface Envelope<T> {
  sha: string
  branch: string
  parserVersion: number
  data: T
}

export function loadCache<T>(kind: string, sha?: string): Envelope<T> | null {
  try {
    const raw = localStorage.getItem(cacheKey(kind))
    if (!raw) return null
    const env = JSON.parse(raw) as Envelope<T>
    if (env.parserVersion !== PARSER_VERSION) return null
    if (sha && env.sha !== sha) return null
    return env
  } catch {
    return null
  }
}

export function saveCache<T>(kind: string, env: Envelope<T>) {
  try {
    localStorage.setItem(cacheKey(kind), JSON.stringify(env))
  } catch (e) {
    console.warn('缓存写入失败（可能超出 localStorage 限额）', e)
    try {
      // 清掉实体缓存腾空间，索引缓存优先保留
      pruneEntityCache(null)
      localStorage.setItem(cacheKey(kind), JSON.stringify(env))
    } catch {
      /* 放弃缓存 */
    }
  }
}

// ---------- 实体缓存：每个实体一个键 ----------
// 早期所有实体塞进同一个键，每存一个都要整体解析再序列化约 50 万字符，
// 并发加载时读-改-写还会互相覆盖。现改为每实体独立键，键里带解析器版本与 commit，
// 版本或仓库更新后旧键自然失效，并在写入失败时被清理。

const ENTITY_PREFIX = `${PREFIX}:e:`

/** 实体缓存键；同一前缀下的键属于当前解析器版本 + 当前 commit */
export function entityKey(sha: string, kind: string, url: string): string {
  return `${entityKeyPrefix(sha)}${kind}:${url}`
}

function entityKeyPrefix(sha: string): string {
  return `${ENTITY_PREFIX}${PARSER_VERSION}:${sha}:`
}

/**
 * 清理实体缓存：keepSha 为当前 commit 时只删旧版本/旧 commit 的键；为 null 时全部删除。
 * 同时清掉旧格式的单键缓存。
 */
export function pruneEntityCache(keepSha: string | null) {
  try {
    const keep = keepSha ? entityKeyPrefix(keepSha) : null
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(ENTITY_PREFIX) && (!keep || !k.startsWith(keep))) doomed.push(k)
    }
    doomed.forEach(k => localStorage.removeItem(k))
    localStorage.removeItem(cacheKey('entities'))
  } catch {
    /* 存储不可用时忽略 */
  }
}
