// 编排：检查最新 commit -> 拉取/缓存 wcp 索引 -> 按需拉取并解析具体页面。
// 所有缓存按 commit SHA 失效；commit 变化时自动重新拉取（实时跟随仓库更新）。

import type {
  BackgroundData, ClassData, FeatPage, RepoMeta, SpeciesData, SpellList, SubclassData,
} from '../types'
import {
  DEFAULT_BRANCH, PARSER_VERSION, fetchPage, fetchWcp, getBranchInfo,
  loadCache, saveCache,
} from './github'
import { parseBookIndex, type BookIndex } from './toc'
import {
  parseBackground, parseClass, parseFeatPage, parseSpecies, parseSpellList, parseSubclass,
} from './parsers'

export interface BookData {
  meta: RepoMeta
  index: BookIndex
}

export async function loadIndex(
  force: boolean,
  onProgress: (msg: string) => void,
  branch = DEFAULT_BRANCH
): Promise<BookData> {
  onProgress('查询仓库最新提交…')
  const info = await getBranchInfo(branch)

  const cached = loadCache<BookData>('index', info.sha)
  if (!force && cached && cached.branch === branch) {
    onProgress('索引已是最新（命中缓存）')
    return cached.data
  }

  onProgress('拉取本书速查目录（不全书.wcp）…')
  const wcp = await fetchWcp(info.sha)
  onProgress('解析全书索引…')
  const index = parseBookIndex(wcp)

  const data: BookData = {
    meta: {
      sha: info.sha,
      shortSha: info.sha.slice(0, 7),
      branch,
      commitDate: info.commitDate,
      fetchedAt: new Date().toISOString(),
    },
    index,
  }
  saveCache('index', { sha: info.sha, branch, parserVersion: PARSER_VERSION, data })
  return data
}

/** API 不可用时退回旧索引缓存 */
export function loadCachedIndex(): BookData | null {
  return loadCache<BookData>('index')?.data ?? null
}

// ---------- 实体（按需加载 + 解析结果缓存） ----------

type EntityKind = 'species' | 'background' | 'class' | 'subclass' | 'spelllist' | 'featpage'

interface EntityStore {
  [key: string]: unknown
}

function entityCacheGet<T>(sha: string, kind: EntityKind, url: string): T | null {
  const env = loadCache<EntityStore>('entities', sha)
  if (!env) return null
  return (env.data[`${kind}:${url}`] as T) ?? null
}

function entityCachePut(sha: string, branch: string, kind: EntityKind, url: string, value: unknown) {
  const env = loadCache<EntityStore>('entities', sha)
  const store: EntityStore = env?.data ?? {}
  store[`${kind}:${url}`] = value
  saveCache('entities', { sha, branch, parserVersion: PARSER_VERSION, data: store })
}

const inflight = new Map<string, Promise<unknown>>()

async function loadEntity<T>(
  meta: RepoMeta,
  kind: EntityKind,
  url: string,
  parse: (html: string, url: string) => T | null
): Promise<T> {
  const cached = entityCacheGet<T>(meta.sha, kind, url)
  if (cached) return cached
  const key = `${kind}:${url}`
  if (inflight.has(key)) return inflight.get(key) as Promise<T>
  const p = (async () => {
    const html = await fetchPage(meta.sha, url)
    const parsed = parse(html, url)
    if (!parsed) throw new Error(`页面解析失败：${url}`)
    entityCachePut(meta.sha, meta.branch, kind, url, parsed)
    inflight.delete(key)
    return parsed
  })()
  inflight.set(key, p)
  return p as Promise<T>
}

export function loadSpeciesEntity(meta: RepoMeta, url: string): Promise<SpeciesData> {
  return loadEntity(meta, 'species', url, parseSpecies)
}

export function loadBackgroundEntity(meta: RepoMeta, url: string): Promise<BackgroundData> {
  return loadEntity(meta, 'background', url, parseBackground)
}

export function loadClassEntity(meta: RepoMeta, url: string): Promise<ClassData> {
  return loadEntity(meta, 'class', url, parseClass)
}

export function loadSubclassEntity(meta: RepoMeta, url: string): Promise<SubclassData> {
  return loadEntity(meta, 'subclass', url, parseSubclass)
}

export function loadFeatPageEntity(meta: RepoMeta, url: string, title: string): Promise<FeatPage> {
  return loadEntity(meta, 'featpage', url, html => {
    const feats = parseFeatPage(html)
    if (feats.length === 0) return null
    return { title, feats } satisfies FeatPage
  })
}

/**
 * 法术总表：把「5E万法大全 + 合作方万法大全」合并，并按职业筛选。
 * 仓库已从「每职业一页」改为总表结构，因此这里合并多页再按职业列过滤。
 */
export async function loadSpellListEntity(
  meta: RepoMeta,
  urls: string[],
  classTitle: string
): Promise<SpellList> {
  const pages = await Promise.all(
    urls.map(u =>
      loadEntity(meta, 'spelllist', u, html => {
        const spells = parseSpellList(html)
        return spells.length > 0 ? { classTitle: '', spells, all: spells } : null
      }).catch(() => null)
    )
  )
  const all = pages.flatMap(p => p?.spells ?? [])
  // 职业名可能带书名后缀（如「法师」「奇械师EFA」），取速查表职业名作为包含判据
  const name = classTitle.replace(/[（(].*$/, '').trim()
  const mine = all.filter(s => s.classes.some(c => name.includes(c) || c.includes(name)))
  // 该职业在总表中无条目（非施法职业或名称对不上）时返回全表，交由界面自行取舍
  const spells = mine.length > 0 ? mine : []
  // 同名法术可能在两份总表里重复，按名称去重
  const seen = new Set<string>()
  const allSeen = new Set<string>()
  return {
    classTitle,
    spells: spells.filter(s => (seen.has(s.name) ? false : (seen.add(s.name), true))),
    all: all.filter(s => (allSeen.has(s.name) ? false : (allSeen.add(s.name), true))),
  }
}
