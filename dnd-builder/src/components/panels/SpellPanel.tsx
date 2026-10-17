import { useMemo, useState } from 'react'
import { ABILITY_CN } from '../../data/mappings'
import {
  classInstances, maxPreparableRing, onClassList, spellAbilityOf, spellPreparable, spellQuotas, spellSlotsFor,
} from '../../rules/multiclass'
import { effectiveSpellList, grantedSpells, spellGroupOptions } from '../../rules/spells'
import { deriveCharacter } from '../../rules/character'
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
  const quotas = spellQuotas(inst)
  const quotaRows = quotas.rows
  // 特性赋予的法术（种族/子职/专长），不占名额
  const granted = useMemo(() => grantedSpells(choices, loaded), [choices, loaded])
  const hasSlots = Object.keys(slotInfo.slots).length > 0 || !!slotInfo.pact

  // 可准备的最高环阶：各职业按自己的等级算，取其中最高者决定显示到哪一环
  const maxRing = Math.max(-1, ...inst.map(maxPreparableRing))
  // 职业可选法术：从全表按各职业可用列表筛选（含三分之一施法者的法师列表、魔法奥秘）
  const classSpells = useMemo(
    () => (spellList?.all ?? []).filter(s => inst.some(i => onClassList(s, i))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spellList, inst.map(i => `${i.cls.id}${i.level}${i.subclass?.id ?? ''}`).join()]
  )
  const byName = new Map(classSpells.map(sp => [sp.name, sp]))
  const preparable = (name: string) => {
    const sp = byName.get(name)
    return !sp || spellPreparable(sp, inst)
  }

  const byRing = useMemo(() => {
    if (!spellList) return []
    const groups: { ring: number; spells: typeof classSpells }[] = []
    for (let r = 0; r <= Math.max(0, maxRing); r++) {
      const list = classSpells.filter(
        s =>
          s.ring === r &&
          (!filter ||
            s.name.toLowerCase().includes(filter.toLowerCase()) ||
            s.school.includes(filter))
      )
      if (list.length) groups.push({ ring: r, spells: list })
    }
    return groups
  }, [spellList, classSpells, filter, maxRing])

  // 空法术表视同没有（非施法职业在总表里没有条目）
  const hasSpells = classSpells.length > 0
  // 专长/种族自选法术（魔法学徒等）：非施法职业也要显示
  const d = deriveCharacter(choices, loaded)
  const featChoices = d.featSpellChoices
  if (!cls && !featChoices.length) return null
  if (!hasSlots && !hasSpells && granted.length === 0 && !featChoices.length) return null

  function setFeatSpells(key: string, patch: Partial<{ list: string; spells: string[] }>) {
    update(prev => {
      const cur = prev.featSpells?.[key] ?? { list: '', spells: [] }
      return { featSpells: { ...prev.featSpells, [key]: { ...cur, ...patch } } }
    })
  }

  const slotChips: string[] = []
  for (const [lv, n] of Object.entries(slotInfo.slots)) slotChips.push(`${lv}环 ×${n}`)
  if (slotInfo.pact) {
    slotChips.push(`魔契法术位 ${slotInfo.pact.level}环 ×${slotInfo.pact.count}（短休回复）`)
  }

  // 名额：戏法与准备法术分开计数，取自职业等级表；已满时禁止再选（取消始终允许）
  const isCantrip = (name: string) => byName.get(name)?.ring === 0
  const chosenCantrips = choices.spells.filter(isCantrip).length
  const chosenLeveled = choices.spells.length - chosenCantrips
  const maxCantrips = quotas.cantrips
  const maxPrepared = quotas.prepared
  const grantedNames = new Set(granted.map(g => g.name))

  function quotaFull(name: string): boolean {
    if (isCantrip(name)) return maxCantrips != null && chosenCantrips >= maxCantrips
    return maxPrepared != null && chosenLeveled >= maxPrepared
  }

  // 已选但不可准备的法术（如降级后）：保留并标红，允许取消
  const overRing = choices.spells.filter(n => !preparable(n))

  function toggleSpell(name: string) {
    update(prev => {
      if (prev.spells.includes(name)) return { spells: prev.spells.filter(s => s !== name) }
      if (quotaFull(name) || !preparable(name)) return {}
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
        {maxRing >= 0 && (
          <><span>可准备至</span><b>{RING_NAMES[maxRing]}{inst.length > 1 && '（兼职时每个法术按其所属职业的等级判断）'}</b></>
        )}
        {choices.spells.length > 0 && (<><span>已选法术</span><b>{choices.spells.length} 个</b></>)}
      </div>
      {overRing.length > 0 && (
        <>
          <p className="meta warn">
            以下已选法术超出当前可准备的环阶（可能是降级或改了职业），点击取消：
          </p>
          <div className="chip-row">
            {overRing.map(n => (
              <button key={n} className="chip small active warn" onClick={() => toggleSpell(n)}>
                {n} ×
              </button>
            ))}
          </div>
        </>
      )}

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

      {featChoices.map(ch => {
        const sel = choices.featSpells?.[ch.key]
        const list = effectiveSpellList(ch, sel?.list)
        const live = d.featSpellPicks[ch.key] ?? []
        const total = ch.groups.reduce((n, g) => n + g.count, 0)
        return (
          <div key={ch.key} className="feat-spells">
            <div className="field-label">
              {ch.source}：自选法术（已选 {live.length}/{total}，不占职业名额）
              {!ch.chooseList && ch.lists.length > 0 && ` · ${ch.lists.join('、')}法术列表`}
            </div>
            {ch.chooseList && (
              <div className="chip-row">
                {ch.lists.map(l => (
                  <button
                    key={l}
                    className={`chip small ${list === l ? 'active' : ''}`}
                    // 换列表时清空已选法术，免得旧列表的法术被静默丢弃后还占着位置
                    onClick={() => setFeatSpells(ch.key, { list: l, spells: list === l ? sel?.spells ?? [] : [] })}
                  >
                    {l}法术列表
                  </button>
                ))}
              </div>
            )}
            {list == null ? (
              <p className="meta">先选择一个法术列表。</p>
            ) : ch.groups.map((g, gi) => {
              const opts = spellGroupOptions(g, list, spellList?.all ?? [])
                .filter(s => !filter || s.name.toLowerCase().includes(filter.toLowerCase()))
              const chosen = opts.filter(s => live.includes(s.name)).length
              return (
                <div key={gi}>
                  <div className="meta">
                    {RING_NAMES[g.ring]} × {g.count}
                    {g.schools.length > 0 && `（${g.schools.join('或')}学派）`}
                    {g.ritual && '（仪式）'}
                  </div>
                  <div className="chip-row">
                    {opts.map(s => {
                      const on = live.includes(s.name)
                      return (
                        <button
                          key={s.name}
                          className={`chip small ${on ? 'active' : ''}`}
                          disabled={!on && chosen >= g.count}
                          title={`${s.school} · ${s.source}`}
                          onClick={() => setFeatSpells(ch.key, {
                            list: list,
                            spells: on ? live.filter(n => n !== s.name) : [...live, s.name],
                          })}
                        >
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {hasSpells && spellList && (
        <>
          <label>
            搜索法术（共 {classSpells.length} 个）
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
                      } ${choices.spells.includes(s.name) && !spellPreparable(s, inst) ? 'warn' : ''}`}
                      disabled={!choices.spells.includes(s.name) && (quotaFull(s.name) || !spellPreparable(s, inst))}
                      title={
                        grantedNames.has(s.name)
                          ? `${s.school} · 已由特性赋予，无需占用名额`
                          : !spellPreparable(s, inst)
                            ? `${s.school} · 你的职业在当前等级还不能准备这一环的此法术`
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
