import { useEffect, useMemo, useState } from 'react'
import type { CharacterChoices, LoadedEntities } from './types'
import {
  loadBackgroundEntity, loadCachedIndex, loadClassEntity, loadIndex,
  loadSpeciesEntity, loadSpellListEntity, loadSubclassEntity, type BookData,
} from './data/loader'
import { buildStatblock } from './rules/statblock'
import { isThirdCasterSubclass } from './rules/multiclass'
import { DEFAULT_CHOICES, DRAFT_KEY, loadDraft } from './state/draft'
import {
  AbilityPanel, BasicsPanel, ClassPanel, FeatPanel, GearPanel, OriginPanel, SpellPanel,
} from './components/panels'
import { SheetPane } from './components/sheet'

const EMPTY_LOADED: LoadedEntities = {
  cls: null,
  subclass: null,
  species: null,
  background: null,
  spellList: null,
  multiclasses: {},
}

export type EntityFlags = Partial<Record<keyof LoadedEntities, 'loading' | string>>

export default function App() {
  const [book, setBook] = useState<BookData | null>(null)
  const [progressMsg, setProgressMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<CharacterChoices>(loadDraft)
  const [loaded, setLoaded] = useState<LoadedEntities>(EMPTY_LOADED)
  const [flags, setFlags] = useState<EntityFlags>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // 防抖写入：编辑停顿 600ms 后落盘
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(choices))
        setSavedAt(new Date().toLocaleTimeString('zh-CN'))
      } catch {
        setSavedAt('保存失败（存储已满）')
      }
    }, 600)
    return () => clearTimeout(t)
  }, [choices])

  function resetDraft() {
    if (!confirm('确认清空当前车卡进度吗？此操作不可撤销。')) return
    localStorage.removeItem(DRAFT_KEY)
    setChoices(DEFAULT_CHOICES)
    setLoaded(EMPTY_LOADED)
  }

  const update = (
    patch: Partial<CharacterChoices> | ((prev: CharacterChoices) => Partial<CharacterChoices>)
  ) =>
    setChoices(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))

  async function refresh(force: boolean) {
    setError(null)
    setProgressMsg('连接 GitHub…')
    try {
      const data = await loadIndex(force, setProgressMsg)
      setBook(data)
      setProgressMsg(null)
    } catch (e) {
      const cached = loadCachedIndex()
      if (cached) {
        setBook(cached)
        setError(`实时拉取失败，已使用本地缓存索引：${(e as Error).message}`)
      } else {
        setError((e as Error).message)
      }
      setProgressMsg(null)
    }
  }

  useEffect(() => {
    refresh(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 实体懒加载：选中即从仓库拉取对应页面并解析 ----

  function trackEntity<K extends keyof LoadedEntities>(
    kind: K,
    url: string,
    promise: Promise<LoadedEntities[K]> | null,
    after?: (value: NonNullable<LoadedEntities[K]>) => void
  ): () => void {
    if (!promise) {
      setLoaded(l => ({ ...l, [kind]: null }))
      setFlags(f => ({ ...f, [kind]: undefined }))
      return () => {}
    }
    let alive = true
    setFlags(f => ({ ...f, [kind]: 'loading' }))
    promise
      .then(value => {
        if (!alive) return
        setLoaded(l => ({ ...l, [kind]: value }))
        setFlags(f => ({ ...f, [kind]: undefined }))
        if (value) after?.(value as NonNullable<LoadedEntities[K]>)
      })
      .catch(e => {
        if (!alive) return
        setLoaded(l => ({ ...l, [kind]: null }))
        setFlags(f => ({ ...f, [kind]: `加载失败：${(e as Error).message}` }))
        console.warn(`加载 ${kind} 失败`, url, e)
      })
    return () => {
      alive = false
    }
  }

  useEffect(() => {
    if (!book || !choices.classUrl) return trackEntity('cls', '', null)
    return trackEntity('cls', choices.classUrl, loadClassEntity(book.meta, choices.classUrl))
  }, [book, choices.classUrl])

  useEffect(() => {
    if (!book || !choices.subclassUrl) return trackEntity('subclass', '', null)
    return trackEntity(
      'subclass',
      choices.subclassUrl,
      loadSubclassEntity(book.meta, choices.subclassUrl)
    )
  }, [book, choices.subclassUrl])

  useEffect(() => {
    if (!book || !choices.speciesUrl) return trackEntity('species', '', null)
    return trackEntity(
      'species',
      choices.speciesUrl,
      loadSpeciesEntity(book.meta, choices.speciesUrl),
      // 只在当前体型不属于该种族时才写默认值——否则刷新页面恢复草稿时会覆盖用户的选择
      sp => update(prev => (sp.sizeOptions.includes(prev.sizeChoice) ? {} : { sizeChoice: sp.sizeOptions[0] }))
    )
  }, [book, choices.speciesUrl])

  useEffect(() => {
    if (!book || !choices.backgroundUrl) return trackEntity('background', '', null)
    return trackEntity(
      'background',
      choices.backgroundUrl,
      // 不在加载后写默认 +2/+1：effectiveBgChoice 已负责回退，写入反而会在刷新时覆盖用户选择
      loadBackgroundEntity(book.meta, choices.backgroundUrl)
    )
  }, [book, choices.backgroundUrl])

  // 兼职职业及其子职：按 url 懒加载，结果以 classUrl 为键存放（不按下标，避免增删时错位）
  const mcKey = (choices.multiclasses ?? []).map(m => `${m.classUrl}|${m.subclassUrl}`).join(';')
  useEffect(() => {
    if (!book) return
    const picks = choices.multiclasses ?? []
    if (picks.length === 0) {
      setLoaded(l => (Object.keys(l.multiclasses).length ? { ...l, multiclasses: {} } : l))
      return
    }
    let alive = true
    Promise.all(
      picks.map(async m => [m.classUrl, {
        cls: await loadClassEntity(book.meta, m.classUrl).catch(() => null),
        subclass: m.subclassUrl ? await loadSubclassEntity(book.meta, m.subclassUrl).catch(() => null) : null,
      }] as const)
    ).then(entries => { if (alive) setLoaded(l => ({ ...l, multiclasses: Object.fromEntries(entries) })) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, mcKey])

  // 法术表：起始职业与所有兼职职业的法术并集（总表按职业列筛选）
  // 奥法骑士/诡术师用法师法术列表，而总表里战士/游荡者没有条目，需要额外并入法师
  const subTitleOf = (classUrl: string, subUrl: string) =>
    book?.index.classes.find(c => c.url === classUrl)?.subclasses.find(s => s.url === subUrl)?.title ?? ''
  const needsWizardList = [
    subTitleOf(choices.classUrl, choices.subclassUrl),
    ...(choices.multiclasses ?? []).map(m => subTitleOf(m.classUrl, m.subclassUrl)),
  ].some(isThirdCasterSubclass)
  const classTitlesKey = [choices.classUrl, ...(choices.multiclasses ?? []).map(m => m.classUrl)]
    .filter(Boolean).join(';') + (needsWizardList ? ';+法师' : '')
  useEffect(() => {
    if (!book || !choices.classUrl) return trackEntity('spellList', '', null)
    const titles = classTitlesKey.split(';')
      .map(u => (u === '+法师' ? '法师' : book.index.classes.find(c => c.url === u)?.title))
      .filter((t): t is string => !!t)
    const urls = book.index.spellLists.map(s => s.url)
    if (titles.length === 0 || urls.length === 0) return trackEntity('spellList', '', null)
    return trackEntity(
      'spellList',
      urls.join(',') + '#' + classTitlesKey,
      loadSpellListEntity(book.meta, urls, titles)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, classTitlesKey])

  const statblock = useMemo(
    () => buildStatblock(choices, book?.meta ?? null, loaded),
    [choices, book, loaded]
  )

  const loadingIndex = progressMsg != null

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          <h1>DND 5R 自动车卡</h1>
          <span className="subtitle">
            数据实时拉取自 DND5eChm/DND5e_chm「本书速查」（覆盖全部已翻译扩展）
          </span>
        </div>
        <div className="repo-status">
          {book && (
            <span className="meta">
              {book.meta.branch}@{book.meta.shortSha}
              {book.meta.commitDate &&
                ` · 提交于 ${new Date(book.meta.commitDate).toLocaleString('zh-CN')}`}
              {` · 职业${book.index.classes.length} · 种族${book.index.speciesGroups.reduce((n, g) => n + g.entries.length, 0)} · 背景${book.index.backgroundGroups.reduce((n, g) => n + g.entries.length, 0)}`}
            </span>
          )}
          {loadingIndex && <span className="progress">{progressMsg}</span>}
          {savedAt && <span className="meta">💾 进度已保存 {savedAt}</span>}
          <button className="btn" disabled={loadingIndex} onClick={() => refresh(true)}>
            {loadingIndex ? '同步中…' : '强制刷新'}
          </button>
          <button className="btn" onClick={resetDraft} title="清空本地车卡进度">
            清空进度
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="layout">
        <div className="controls">
          {!book && !error && (
            <div className="placeholder">正在从 GitHub 拉取「本书速查」索引，首次加载约需数秒…</div>
          )}
          {book && (
            <>
              <BasicsPanel choices={choices} update={update} />
              <ClassPanel
                book={book}
                choices={choices}
                update={update}
                loaded={loaded}
                flags={flags}
              />
              <OriginPanel
                book={book}
                choices={choices}
                update={update}
                loaded={loaded}
                flags={flags}
              />
              <AbilityPanel choices={choices} update={update} loaded={loaded} />
              <FeatPanel
                book={book}
                choices={choices}
                update={update}
                loaded={loaded}
                flags={flags}
              />
              <GearPanel choices={choices} update={update} />
              <SpellPanel choices={choices} update={update} loaded={loaded} flags={flags} />
            </>
          )}
        </div>
        <SheetPane statblock={statblock} choices={choices} loaded={loaded} />
      </main>
    </div>
  )
}
