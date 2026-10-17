import { useMemo, useState } from 'react'
import { ABILITY_CN } from '../../data/mappings'
import { classInstances, spellAbilityOf, spellSlotsFor } from '../../rules/multiclass'
import { grantedSpells } from '../../rules/spells'
import { EntityStatus, Section, type PanelProps } from '../ui'

// ---------- 第五步：法术（从法术速查中勾选，覆盖全部扩展书） ----------

const RING_NAMES = ['戏法', '一环', '二环', '三环', '四环', '五环', '六环', '七环', '八环', '九环']

export function SpellPanel({
  choices,
  update,
  loaded,
  flags,
}: Pick<PanelProps, 'choices' | 'update' | 'loaded' | 'flags'>) {
  const [filter, setFilter] = useState('')
  const cls = loaded.cls
  const spellList = loaded.spellList
  const inst = classInstances(choices, loaded)
  // 兼职时按兼职施法者表合算法术位；契约魔法单列
  const slotInfo = spellSlotsFor(inst)
  // 每个职业在自己的等级上的戏法/准备法术名额（规则：法术准备按职业分别决定）
  const quotaRows = inst
    .map(i => ({ i, row: i.cls.levels.find(r => r.level === i.level) }))
    .filter(x => x.row && (x.row.cantrips != null || x.row.preparedSpells != null))
  const sumOrNull = (vals: (number | undefined)[]) =>
    vals.some(v => v != null) ? vals.reduce<number>((n, v) => n + (v ?? 0), 0) : null
  // 特性赋予的法术（种族/子职/专长），不占名额
  const granted = useMemo(() => grantedSpells(choices, loaded), [choices, loaded])
  const hasSlots = Object.keys(slotInfo.slots).length > 0 || !!slotInfo.pact

  const byRing = useMemo(() => {
    if (!spellList) return []
    const groups: { ring: number; spells: typeof spellList.spells }[] = []
    for (let r = 0; r <= 9; r++) {
      const list = spellList.spells.filter(
        s =>
          s.ring === r &&
          (!filter ||
            s.name.toLowerCase().includes(filter.toLowerCase()) ||
            s.school.includes(filter))
      )
      if (list.length) groups.push({ ring: r, spells: list })
    }
    return groups
  }, [spellList, filter])

  // 空法术表视同没有（非施法职业在总表里没有条目）
  const hasSpells = (spellList?.spells.length ?? 0) > 0
  if (!cls || (!hasSlots && !hasSpells && granted.length === 0)) return null

  const slotChips: string[] = []
  for (const [lv, n] of Object.entries(slotInfo.slots)) slotChips.push(`${lv}环 ×${n}`)
  if (slotInfo.pact) {
    slotChips.push(`魔契法术位 ${slotInfo.pact.level}环 ×${slotInfo.pact.count}（短休回复）`)
  }

  // 名额：戏法与准备法术分开计数，取自职业等级表；已满时禁止再选（取消始终允许）
  const isCantrip = (name: string) => spellList?.spells.find(s => s.name === name)?.ring === 0
  const chosenCantrips = choices.spells.filter(isCantrip).length
  const chosenLeveled = choices.spells.length - chosenCantrips
  const maxCantrips = sumOrNull(quotaRows.map(x => x.row!.cantrips))
  const maxPrepared = sumOrNull(quotaRows.map(x => x.row!.preparedSpells))
  const grantedNames = new Set(granted.map(g => g.name))

  function quotaFull(name: string): boolean {
    if (isCantrip(name)) return maxCantrips != null && chosenCantrips >= maxCantrips
    return maxPrepared != null && chosenLeveled >= maxPrepared
  }

  function toggleSpell(name: string) {
    update(prev => {
      if (prev.spells.includes(name)) return { spells: prev.spells.filter(s => s !== name) }
      if (quotaFull(name)) return {}
      return { spells: [...prev.spells, name] }
    })
  }

  return (
    <Section step="五" title="法术" hint="法术列表来自速查，覆盖全部扩展书">
      <div className="kv-grid">
        {slotChips.length > 0 && (
          <><span>法术位</span><b>
            {slotChips.join('，')}
            {slotInfo.mode === 'multi' && `（兼职施法者等级 ${slotInfo.casterLevel}）`}
          </b></>
        )}
        {maxCantrips != null && (
          <><span>戏法</span><b className={chosenCantrips > maxCantrips ? 'warn' : ''}>
            已选 {chosenCantrips} / {maxCantrips}
          </b></>
        )}
        {maxPrepared != null && (
          <><span>准备法术</span><b className={chosenLeveled > maxPrepared ? 'warn' : ''}>
            已选 {chosenLeveled} / {maxPrepared}
          </b></>
        )}
        {quotaRows.length > 1 && (
          <><span>名额来源</span><b>
            {quotaRows.map(({ i, row }) =>
              `${i.cls.nameCn}${i.level}：戏法 ${row!.cantrips ?? 0}、准备 ${row!.preparedSpells ?? 0}`
            ).join('；')}
          </b></>
        )}
        {inst.some(i => spellAbilityOf(i)) && (
          <><span>施法属性</span><b>
            {/* 兼职时每个职业的法术用该职业自己的施法属性 */}
            {inst.filter(i => spellAbilityOf(i))
              .map(i => `${ABILITY_CN[spellAbilityOf(i)!]}${inst.length > 1 ? `（${i.cls.nameCn}）` : ''}`)
              .join('、')}
          </b></>
        )}
        {choices.spells.length > 0 && (<><span>已选法术</span><b>{choices.spells.length} 个</b></>)}
      </div>

      <EntityStatus flag={flags.spellList} />

      {granted.length > 0 && (
        <>
          <div className="field-label">
            特性赋予的法术（{granted.length} 个，自动获得，不占名额）
          </div>
          <div className="chip-row">
            {granted.map(g => (
              <span key={g.name} className="chip small granted" title={`${g.source} · ${g.level}级获得`}>
                {g.name}
                <span className="tag">{g.level}级</span>
              </span>
            ))}
          </div>
        </>
      )}

      {hasSpells && spellList && (
        <>
          <label>
            搜索法术（共 {spellList.spells.length} 个）
            <input
              value={filter}
              placeholder="输入中文/英文名或学派过滤…"
              onChange={e => setFilter(e.target.value)}
            />
          </label>
          <div className="spell-groups">
            {byRing.map(g => (
              <details key={g.ring} className="traits" open={!!filter}>
                <summary>
                  {RING_NAMES[g.ring]}（{g.spells.length} 个
                  {g.spells.filter(s => choices.spells.includes(s.name)).length > 0 &&
                    `，已选 ${g.spells.filter(s => choices.spells.includes(s.name)).length}`}
                  ）
                </summary>
                <div className="chip-row">
                  {g.spells.map(s => (
                    <button
                      key={s.name + s.source}
                      className={`chip small ${choices.spells.includes(s.name) ? 'active' : ''} ${
                        grantedNames.has(s.name) ? 'granted' : ''
                      }`}
                      disabled={!choices.spells.includes(s.name) && quotaFull(s.name)}
                      title={
                        grantedNames.has(s.name)
                          ? `${s.school} · 已由特性赋予，无需占用名额`
                          : `${s.school}${s.source ? ` · ${s.source}` : ''}`
                      }
                      onClick={() => toggleSpell(s.name)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </>
      )}

      <label>
        额外法术（每行一个，自由输入）
        <textarea
          rows={2}
          value={choices.spellsText}
          placeholder="法术速查中没有的法术可以手动补充…"
          onChange={e => update({ spellsText: e.target.value })}
        />
      </label>
    </Section>
  )
}
