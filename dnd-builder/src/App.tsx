import { useEffect, useMemo, useState } from 'react'
import type { CharacterChoices, LoadedEntities } from './types'
import {
  loadBackgroundEntity, loadCachedIndex, loadClassEntity, loadIndex,
  loadSpeciesEntity, loadSpellListEntity, loadSubclassEntity, type BookData,
} from './data/loader'
import { buildStatblock } from './rules/build'
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
}

const DEFAULT_CHOICES: CharacterChoices = {
  name: '',
  alignment: '绝对中立',
  level: 1,
  classUrl: '',
  subclassUrl: '',
  speciesUrl: '',
  subraceChoice: '',
  sizeChoice: '',
  backgroundUrl: '',
  bgBonusMode: '2+1',
  bgPlus2: null,
  bgPlus1: null,
  speciesPicks: [],
  traitOptions: {},
  abilityMethod: 'array',
  hpMethod: 'average',
  hpRolls: [],
  hpManual: null,
  baseScores: { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
  rolledSets: [],
  rollSetIndex: -1,
  classSkills: [],
  classEquipChoice: 0,
  bgEquipChoice: 0,
  armorId: 'none',
  shield: false,
  weaponIds: [],
  languages: ['通用语'],
  spells: [],
  spellsText: '',
  feats: {},
  about: '',
}

export type EntityFlags = Partial<Record<keyof LoadedEntities, 'loading' | string>>

// ---- 车卡进度本地存档（关闭页面不丢进度） ----
// 只存用户的「选择」，不存解析出的实体——后者按 URL 从实体缓存重建，
// 这样存档很小，也不会随规则书更新而失效。
const DRAFT_KEY = 'dnd5r-builder:draft'

function loadDraft(): CharacterChoices {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return DEFAULT_CHOICES
    // 与默认值合并：老存档缺少的新字段自动补齐
    return { ...DEFAULT_CHOICES, ...(JSON.parse(raw) as Partial<CharacterChoices>) }
  } catch {
    return DEFAULT_CHOICES
  }
}

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
      sp => update({ sizeChoice: sp.sizeOptions[0] })
    )
  }, [book, choices.speciesUrl])

  useEffect(() => {
    if (!book || !choices.backgroundUrl) return trackEntity('background', '', null)
    return trackEntity(
      'background',
      choices.backgroundUrl,
      loadBackgroundEntity(book.meta, choices.backgroundUrl),
      bg => update({ bgPlus2: bg.abilities[0] ?? null, bgPlus1: bg.abilities[1] ?? null })
    )
  }, [book, choices.backgroundUrl])

  useEffect(() => {
    if (!book || !choices.classUrl) return trackEntity('spellList', '', null)
    const entry = book.index.classes.find(c => c.url === choices.classUrl)
    // 法术速查现为若干「万法大全」总表，全部载入后按职业筛选
    const urls = book.index.spellLists.map(s => s.url)
    if (!entry || urls.length === 0) return trackEntity('spellList', '', null)
    return trackEntity(
      'spellList',
      urls.join(','),
      loadSpellListEntity(book.meta, urls, entry.title)
    )
  }, [book, choices.classUrl])

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
