import { useMemo, useState } from 'react'
import { deriveCharacter } from '../../rules/character'
import { checklist } from '../../rules/checklist'
import { type PanelProps } from '../ui'

// ---------- 完成度清单：待选项与不合规项 ----------

export function ChecklistPanel({ choices, loaded }: Pick<PanelProps, 'choices' | 'loaded'>) {
  const items = useMemo(() => checklist(deriveCharacter(choices, loaded)), [choices, loaded])
  const [open, setOpen] = useState(true)
  const todos = items.filter(i => i.level === 'todo').length
  const warns = items.length - todos

  return (
    <section className="panel checklist">
      <h2 onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
        <span className="step">{items.length ? '!' : '✓'}</span>
        检查清单
        <span className="hint">
          {items.length ? `待完成 ${todos} · 需注意 ${warns}` : '全部完成，可以导出了'}
          {items.length > 0 && (open ? ' ▾' : ' ▸')}
        </span>
      </h2>
      {open && items.length > 0 && (
        <ul>
          {items.map((it, i) => (
            <li key={i} className={it.level === 'warn' ? 'warn' : ''}>
              {it.level === 'warn' ? '⚠ ' : '○ '}{it.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
