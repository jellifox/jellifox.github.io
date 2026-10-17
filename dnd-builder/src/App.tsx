import { useEffect, useMemo, useRef, useState } from 'react'
import type { CharacterChoices, LoadedEntities } from './types'
import {
  loadBackgroundEntity, loadCachedIndex, loadClassEntity, loadIndex,
  loadSpeciesEntity, loadSpellListEntity, loadSubclassEntity, type BookData,
} from './data/loader'
import { buildStatblock } from './rules/statblock'
import { DEFAULT_CHOICES } from './state/draft'
import { exportSave, loadRoster, newCharId, saveRoster, type Roster } from './state/roster'
import { importCharacter } from './state/importer'
import {
  AbilityPanel, BasicsPanel, ChecklistPanel, ClassPanel, FeatPanel, GearPanel, OriginPanel, SkillPanel, SpellPanel,
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
  const [roster, setRoster] = useState<Roster>(loadRoster)
  const choices = roster.chars[roster.current]
  const setChoices = (fn: (prev: CharacterChoices) => CharacterChoices) =>
    setRoster(r => ({ ...r, chars: { ...r.chars, [r.current]: fn(r.chars[r.current]) } }))
  const fileInput = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<LoadedEntities>(EMPTY_LOADED)
  const [flags, setFlags] = useState<EntityFlags>({})
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // 防抖写入：编辑停顿 600ms 后落盘
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        saveRoster(roster)
        setSavedAt(new Date().toLocaleTimeString('zh-CN'))
      } catch {
        setSavedAt('保存失败（存储已满）')
      }
    }, 600)
    return () => clearTimeout(t)
  }, [roster])

  // ---- 多角色 ----
  // 不清空 loaded：各实体 effect 以 url 为依赖，url 变了自会重载/清空；
  // 若在这里清空，而新旧角色的职业 url 相同，effect 不会重跑，职业就一直是空的
  function switchTo(id: string, chars = roster.chars) {
    setRoster({ current: id, chars })
  }
  function addChar(c: CharacterChoices) {
    const id = newCharId()
    switchTo(id, { ...roster.chars, [id]: c })
  }
  function deleteChar() {
    if (!confirm(`确认删除角色「${choices.name || '未命名'}」吗？此操作不可撤销。`)) return
    const { [roster.current]: _gone, ...rest } = roster.chars
    const ids = Object.keys(rest)
    if (ids.length) switchTo(ids[0], rest)
    else addChar(DEFAULT_CHOICES)
  }
  function download(text: string, fileName: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    a.download = fileName
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function importFile(file: File) {
    if (!book) return
    try {
      const { choices: c, notes } = importCharacter(await file.text(), book.index)
      addChar(c)
      if (notes.length) alert(`已导入为新角色。请留意：\n· ${notes.join('\n· ')}`)
    } catch (e) {
      alert(`导入失败：${(e as Error).message}`)
    }
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

  // 法术总表：职业可选范围由法术面板按 spellListNames 从全表筛选（三分之一施法者、魔法奥秘等）
  const classTitlesKey = [choices.classUrl, ...(choices.multiclasses ?? []).map(m => m.classUrl)]
    .filter(Boolean).join(';')
  useEffect(() => {
    if (!book || !choices.classUrl) return trackEntity('spellList', '', null)
    const titles = classTitlesKey.split(';')
      .map(u => book.index.classes.find(c => c.url === u)?.title)
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
        </div>
        <div className="repo-status">
          <select
            value={roster.current}
            onChange={e => switchTo(e.target.value)}
            title="切换角色（全部保存在本机浏览器）"
          >
            {Object.entries(roster.chars).map(([id, c]) => (
              <option key={id} value={id}>{c.name || '未命名冒险者'}</option>
            ))}
          </select>
          <button className="btn" onClick={() => addChar(DEFAULT_CHOICES)}>新建</button>
          <button className="btn" onClick={() => addChar({ ...choices, name: `${choices.name || '未命名'}（副本）` })}>复制</button>
          <button className="btn" onClick={deleteChar}>删除</button>
          <button
            className="btn"
            disabled={!book}
            onClick={() => fileInput.current?.click()}
            title="导入本工具的存档，或面团角色卡导出的 JSON"
          >
            导入
          </button>
          <button className="btn" onClick={() => download(exportSave(choices), `${choices.name || '未命名角色'}_车卡存档.json`)}>
            导出存档
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) importFile(f)
              e.target.value = ''
            }}
          />
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
              <ChecklistPanel choices={choices} loaded={loaded} />
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
              <SkillPanel choices={choices} update={update} loaded={loaded} />
              <GearPanel choices={choices} update={update} loaded={loaded} />
              <SpellPanel choices={choices} update={update} loaded={loaded} flags={flags} />
            </>
          )}
        </div>
        <SheetPane statblock={statblock} choices={choices} loaded={loaded} />
      </main>
    </div>
  )
}
