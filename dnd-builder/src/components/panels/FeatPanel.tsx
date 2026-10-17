import { useEffect, useMemo, useState } from 'react'
import type { FeatPage } from '../../types'
import { loadFeatPageEntity } from '../../data/loader'
import { allFeatSlots, type FeatSlot } from '../../rules/build'
import { deriveCharacter, featPrereqUnmet } from '../../rules/character'
import { Section, type PanelProps } from '../ui'

// ---------- 专长（按升级列表：槽位由职业等级表推导） ----------

type PageState = FeatPage | 'loading' | `err:${string}`

export function FeatPanel({ book, choices, update, loaded }: PanelProps) {
  const cls = loaded.cls
  const bg = loaded.background
  // 兼职时各职业按自己的等级给槽位
  const slots = allFeatSlots(choices, loaded)
  const d = useMemo(() => deriveCharacter(choices, loaded), [choices, loaded])

  const core = book.index.featPages.find(g => g.group === '核心专长')?.entries ?? []
  const originUrl = core.find(e => /起源/.test(e.title))?.url ?? ''
  const styleUrl = core.find(e => /战斗风格/.test(e.title))?.url ?? ''
  const generalDefault = core.find(e => /通用/.test(e.title))?.url ?? ''
  const epicDefault = core.find(e => /传奇/.test(e.title))?.url ?? ''

  // 通用槽可换页浏览其他书的专长；传奇恩惠槽可换到扩展书的传奇恩惠页
  const generalGroups = book.index.featPages
    .map(g => ({
      group: g.group,
      entries: g.entries.filter(e => !/起源专长|战斗风格|传奇恩惠/.test(e.title)),
    }))
    .filter(g => g.entries.length > 0)
  const epicPages = book.index.featPages
    .flatMap(g => g.entries)
    .filter(e => /传奇恩惠/.test(e.title))

  const [pages, setPages] = useState<Record<string, PageState>>({})
  const [slotPage, setSlotPage] = useState<Record<string, string>>({})

  const urlFor = (s: FeatSlot) =>
    s.kind === 'style'
      ? styleUrl
      : slotPage[s.key] ?? (s.kind === 'epic' ? epicDefault : generalDefault)

  const needed = [
    ...(bg?.feat && originUrl ? [originUrl] : []),
    ...slots.map(urlFor),
  ].filter(u => u && !pages[u])

  useEffect(() => {
    for (const url of needed) {
      setPages(p => ({ ...p, [url]: 'loading' }))
      loadFeatPageEntity(book.meta, url, url)
        .then(fp => setPages(p => ({ ...p, [url]: fp })))
        .catch(e => setPages(p => ({ ...p, [url]: `err:${(e as Error).message}` })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed.join('|'), book.meta.sha])

  // 起源专长：按背景专长的中文名自动匹配核心起源专长页，带出完整描述
  const originPage = pages[originUrl]
  useEffect(() => {
    if (!bg?.feat || typeof originPage !== 'object') return
    const cn = bg.feat.match(/^[^\sA-Za-z（(]+/)?.[0] ?? bg.feat
    const hit = originPage.feats.find(f => f.name.replace(/\s/g, '').startsWith(cn))
    if (!hit) return
    update(prev =>
      prev.feats['origin']?.name === hit.name ? {} : { feats: { ...prev.feats, origin: hit } }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg?.feat, originPage])

  function pickFeat(slotKey: string, page: PageState, name: string) {
    update(prev => {
      const feats = { ...prev.feats }
      const hit = typeof page === 'object' ? page.feats.find(f => f.name === name) : null
      if (hit) feats[slotKey] = hit
      else delete feats[slotKey]
      return { feats }
    })
  }

  if (!cls && !bg) {
    return (
      <Section step="附" title="专长" hint="按升级列表选择">
        <p className="meta">先选择职业与背景：起源专长来自背景，升级专长槽位来自职业等级表。</p>
      </Section>
    )
  }

  return (
    <Section step="附" title="专长" hint="槽位按职业等级表推导（2024 规则）">
      {bg && (
        <div className="feat-slot">
          <span className="feat-slot-label">起源专长（背景「{bg.nameCn}」自动获得）</span>
          <b>
            {choices.feats['origin']?.name ?? bg.feat ?? '—'}
            {originPage === 'loading' && ' ⏳'}
          </b>
        </div>
      )}
      {slots.map(s => {
        const url = urlFor(s)
        const page = pages[url]
        const sel = choices.feats[s.key]
        const selUnmet = sel ? featPrereqUnmet(sel.desc, d) : []
        return (
          <div className="feat-slot" key={s.key}>
            <span className="feat-slot-label">{s.label}</span>
            {s.kind === 'general' && (
              <select
                value={url}
                title="换一本书的专长页"
                onChange={e => setSlotPage(p => ({ ...p, [s.key]: e.target.value }))}
              >
                {generalGroups.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.entries.map(e => (
                      <option key={e.url} value={e.url}>{e.title}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            {s.kind === 'epic' && epicPages.length > 1 && (
              <select
                value={url}
                title="换一本书的传奇恩惠页"
                onChange={e => setSlotPage(p => ({ ...p, [s.key]: e.target.value }))}
              >
                {epicPages.map(e => (
                  <option key={e.url} value={e.url}>{e.title}</option>
                ))}
              </select>
            )}
            <select
              value={sel?.name ?? ''}
              title={sel?.desc.slice(0, 300) ?? ''}
              onChange={e => pickFeat(s.key, page, e.target.value)}
            >
              <option value="">— 未选择 —</option>
              {typeof page === 'object' &&
                page.feats.map(f => {
                  const unmet = featPrereqUnmet(f.desc, d)
                  // 不满足先决的不可选；已选中的保留显示，便于看到原因后再换
                  return (
                    <option
                      key={f.name}
                      value={f.name}
                      disabled={unmet.length > 0 && f.name !== sel?.name}
                      title={f.desc.slice(0, 300)}
                    >
                      {f.name}{unmet.length ? `（先决不满足：${unmet.join('，')}）` : ''}
                    </option>
                  )
                })}
            </select>
            {selUnmet.length > 0 && <span className="meta warn">先决不满足：{selUnmet.join('，')}</span>}
            {page === 'loading' && <span className="meta">⏳</span>}
            {typeof page === 'string' && page.startsWith('err:') && (
              <span className="meta warn">{page.slice(4)}</span>
            )}
          </div>
        )
      })}
      {cls && slots.length === 0 && (
        <p className="meta">当前职业等级尚无升级专长槽位（各职业首个通常在该职业 4 级）。</p>
      )}
    </Section>
  )
}
