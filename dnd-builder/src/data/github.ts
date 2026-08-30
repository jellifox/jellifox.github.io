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

async function fetchRawBuffer(ref: string, path: string): Promise<ArrayBuffer> {
  const url = `${RAW}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败（${res.status}）：${path}`)
  return res.arrayBuffer()
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

export const PARSER_VERSION = 12
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
      localStorage.removeItem(cacheKey('entities'))
      localStorage.setItem(cacheKey(kind), JSON.stringify(env))
    } catch {
      /* 放弃缓存 */
    }
  }
}
