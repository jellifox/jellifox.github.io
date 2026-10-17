import { useState, type ReactNode } from 'react'
import type { CharacterChoices, LoadedEntities } from '../types'
import { type BookData } from '../data/loader'
import type { EntityFlags } from '../App'

export interface PanelProps {
  book: BookData
  choices: CharacterChoices
  update: (
    patch: Partial<CharacterChoices> | ((prev: CharacterChoices) => Partial<CharacterChoices>)
  ) => void
  loaded: LoadedEntities
  flags: EntityFlags
}

export function Section(props: { step: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>
        <span className="step">{props.step}</span>
        {props.title}
        {props.hint && <span className="hint">{props.hint}</span>}
      </h2>
      {props.children}
    </section>
  )
}

export function EntityStatus({ flag }: { flag: 'loading' | string | undefined }) {
  if (!flag) return null
  if (flag === 'loading') return <p className="meta">⏳ 正在从仓库拉取页面…</p>
  return <p className="meta warn">{flag}（可换一个选项，或点击顶部「强制刷新」）</p>
}

/**
 * 数字输入框：输入过程中允许临时为空或越界，失焦（或按回车）时才夹取范围并提交。
 * 若在 onChange 里直接夹取，删空的瞬间就会被填回最小值，导致无法清空重填。
 *
 * emptyMeans: 失焦时内容为空的处理方式
 *   'revert' —— 恢复原值（等级这类必填项）
 *   'null'   —— 提交 null（属性值这类「可留空」项）
 */
export function NumberField({
  value, min, max, onCommit, emptyMeans = 'revert', className, placeholder,
}: {
  value: number | null
  min: number
  max: number
  onCommit: (v: number | null) => void
  emptyMeans?: 'revert' | 'null'
  className?: string
  placeholder?: string
}) {
  // draft 为 null 表示「未在编辑」，直接显示外部值
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft === null) return
    const t = draft.trim()
    if (!t) {
      if (emptyMeans === 'null') onCommit(null)
      // 'revert' 时不提交，交回外部值显示
    } else {
      const n = parseInt(t, 10)
      onCommit(Number.isNaN(n) ? (emptyMeans === 'null' ? null : value) : Math.max(min, Math.min(max, n)))
    }
    setDraft(null)
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      className={className}
      placeholder={placeholder}
      value={draft ?? (value ?? '').toString()}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}
