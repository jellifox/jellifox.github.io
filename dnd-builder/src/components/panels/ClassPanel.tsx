import { useEffect, useState } from 'react'
import type { AbilityKey, ClassData, MulticlassPick, SkillKey } from '../../types'
import { loadClassEntity } from '../../data/loader'
import { ABILITY_CN, SKILL_ABILITY, SKILL_CN, SKILL_KEYS } from '../../data/mappings'
import { deriveAbilities } from '../../rules/build'
import {
  multiclassBlockers, multiclassKeyPrefix, multiclassProfs, prereqLabel, prereqOf,
  primaryClassLevel, unmetPrereq,
} from '../../rules/multiclass'
import { EntityStatus, Section, type PanelProps } from '../ui'

// ---------- 第一步：职业 ----------

export function ClassPanel({ book, choices, update, loaded, flags }: PanelProps) {
  const entry = book.index.classes.find(c => c.url === choices.classUrl)
  const cls = loaded.cls
  const skillOptions: SkillKey[] =
    cls?.skillChoices === 'any' ? SKILL_KEYS : (cls?.skillChoices ?? [])
  const bgSkills = new Set(loaded.background?.skills ?? [])

  function toggleSkill(s: SkillKey) {
    update(prev => {
      const has = prev.classSkills.includes(s)
      if (has) return { classSkills: prev.classSkills.filter(x => x !== s) }
      if (cls && prev.classSkills.length < cls.skillChoiceCount) {
        return { classSkills: [...prev.classSkills, s] }
      }
      return {}
    })
  }

  return (
    <Section step="一" title="选择职业" hint="决定生命骰、豁免与技能熟练">
      <div className="chip-row">
        {book.index.classes.map(c => (
          <button
            key={c.url}
            className={`chip ${choices.classUrl === c.url ? 'active' : ''}`}
            title={c.source}
            onClick={() =>
              update(prev => {
                // 若新的起始职业原本是兼职之一，把它从兼职里移除（等级并回总等级不变）
                const dup = (prev.multiclasses ?? []).find(m => m.classUrl === c.url)
                return {
                  classUrl: c.url,
                  subclassUrl: '',
                  classSkills: [],
                  classEquipChoice: 0,
                  spells: [],
                  multiclasses: dup ? (prev.multiclasses ?? []).filter(m => m !== dup) : prev.multiclasses,
                }
              })
            }
          >
            {c.title}
            {c.source && !c.url.startsWith('玩家手册2024') && (
              <span className="tag">{c.source}</span>
            )}
          </button>
        ))}
      </div>
      <EntityStatus flag={flags.cls} />

      {cls && (
        <>
          <p className="flavor">{cls.flavor}</p>
          <div className="kv-grid">
            <span>主要属性</span><b>{cls.primaryAbility || '—'}</b>
            <span>生命值骰</span><b>D{cls.hitDie}</b>
            <span>豁免熟练</span><b>{cls.saves.map(k => ABILITY_CN[k]).join('、') || '—'}</b>
            <span>武器熟练</span><b>{cls.weaponProf || '—'}</b>
            <span>护甲受训</span><b>{cls.armorTraining || '—'}</b>
          </div>

          {entry && entry.subclasses.length > 0 && (
            <label>
              子职{choices.level < 3 ? '（通常 3 级解锁）' : ''}
              <select
                value={choices.subclassUrl}
                onChange={e => update({ subclassUrl: e.target.value })}
              >
                <option value="">— 未选择 —</option>
                {entry.subclasses.map(s => (
                  <option key={s.url} value={s.url}>
                    {s.title}
                    {s.source && !s.url.startsWith('玩家手册2024') ? `（${s.source}）` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <EntityStatus flag={flags.subclass} />
          {loaded.subclass && (
            <p className="meta">
              已加载子职「{loaded.subclass.nameCn}」：{loaded.subclass.features.length} 项特性将按等级写入角色卡
            </p>
          )}

          {entry && entry.optionalResources.length > 0 && (
            <p className="meta">
              可选资源（非子职，自选菜单）：
              {entry.optionalResources.map(r => r.title).join('、')}
            </p>
          )}

          <div className="field-label">
            职业技能熟练（选 {cls.skillChoiceCount} 项，已选 {choices.classSkills.length}）
            {cls.skillChoices === 'any' && '：可从全部技能中任选'}
          </div>
          <div className="chip-row">
            {skillOptions.map(s => {
              const checked = choices.classSkills.includes(s)
              const full = !checked && choices.classSkills.length >= cls.skillChoiceCount
              return (
                <button
                  key={s}
                  className={`chip small ${checked ? 'active' : ''}`}
                  disabled={full}
                  onClick={() => toggleSkill(s)}
                  title={`关联属性：${ABILITY_CN[SKILL_ABILITY[s]]}`}
                >
                  {SKILL_CN[s]}
                  {bgSkills.has(s) ? '（背景已有）' : ''}
                </button>
              )
            })}
          </div>

          {cls.equipmentOptions.length > 0 && (
            <>
              <div className="field-label">起始装备</div>
              <div className="radio-list">
                {cls.equipmentOptions.map((opt, i) => (
                  <label key={i} className="radio-item">
                    <input
                      type="radio"
                      name="cls-equip"
                      checked={choices.classEquipChoice === i}
                      onChange={() => update({ classEquipChoice: i })}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <MulticlassSection book={book} choices={choices} update={update} loaded={loaded} flags={flags} />
        </>
      )}
    </Section>
  )
}

// ---------- 兼职 ----------

/**
 * 兼职区块。等级约定：总等级 = 起始职业等级 + Σ兼职等级；增减兼职等级时同步调整总等级，
 * 使起始职业等级保持不变（符合「升一级、这级拿兼职」的直觉）。
 * 先决（玩家手册2024）：新职业与所有当前职业的主要属性都要 ≥13。
 */
function MulticlassSection({ book, choices, update, loaded }: PanelProps) {
  const [picking, setPicking] = useState(false)
  // 候选职业的解析结果（用于展示先决）；只在展开选择器时才拉取，结果有缓存
  const [candidates, setCandidates] = useState<Record<string, ClassData | 'loading' | 'error'>>({})
  const mcs = choices.multiclasses ?? []
  const totals = deriveAbilities(choices, loaded.background, loaded.species, loaded).total
  const primary = loaded.cls!
  const currentClasses = [primary, ...mcs.map(m => loaded.multiclasses[m.classUrl]?.cls).filter((c): c is ClassData => !!c)]
  const primaryUnmet = unmetPrereq(prereqOf(primary), totals)
  const takenUrls = new Set([choices.classUrl, ...mcs.map(m => m.classUrl)])
  const pool = book.index.classes.filter(c => c.title !== '兼职规则' && !takenUrls.has(c.url))

  useEffect(() => {
    if (!picking) return
    for (const c of pool) {
      if (candidates[c.url]) continue
      setCandidates(p => ({ ...p, [c.url]: 'loading' }))
      loadClassEntity(book.meta, c.url)
        .then(cd => setCandidates(p => ({ ...p, [c.url]: cd })))
        .catch(() => setCandidates(p => ({ ...p, [c.url]: 'error' })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, book.meta.sha])

  const fmtUnmet = (u: AbilityKey[][]) =>
    u.map(g => g.map(k => `${ABILITY_CN[k]}${totals[k]}`).join('或')).join('、')

  function addClass(url: string) {
    if (choices.level >= 20) return
    update(prev => ({
      multiclasses: [...(prev.multiclasses ?? []), { classUrl: url, subclassUrl: '', level: 1, skill: null }],
      level: prev.level + 1,
    }))
    setPicking(false)
  }
  function setMc(i: number, patch: Partial<MulticlassPick>) {
    update(prev => {
      const list = [...(prev.multiclasses ?? [])]
      const oldLv = list[i].level
      list[i] = { ...list[i], ...patch }
      // 兼职等级变化同步到总等级，保持起始职业等级不变
      const dLv = (patch.level ?? oldLv) - oldLv
      return { multiclasses: list, level: prev.level + dLv }
    })
  }
  function removeMc(i: number) {
    update(prev => {
      const list = [...(prev.multiclasses ?? [])]
      const [gone] = list.splice(i, 1)
      // 清掉该兼职名下的专长、属性分配与方案选择（键以 url 为前缀，其他兼职不受影响）
      const pre = multiclassKeyPrefix(gone.classUrl)
      const drop = <T,>(rec: Record<string, T>) =>
        Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(pre) && !k.startsWith(`feat:${pre}`)))
      return {
        multiclasses: list,
        level: Math.max(1, prev.level - gone.level),
        feats: drop(prev.feats),
        abilityPicks: drop(prev.abilityPicks),
        bonusSchemes: drop(prev.bonusSchemes),
      }
    })
  }

  return (
    <div className="multiclass">
      <div className="field-label">
        兼职
        {mcs.length > 0 && (
          <span className="meta">
            （总等级 {choices.level} = {primary.nameCn} {primaryClassLevel(choices)}
            {mcs.map(m => ` + ${loaded.multiclasses[m.classUrl]?.cls?.nameCn ?? '…'} ${m.level}`).join('')}）
          </span>
        )}
      </div>

      <p className={`meta ${primaryUnmet.length ? 'warn' : ''}`}>
        起始职业 {primary.nameCn} 的兼职先决：{prereqLabel(prereqOf(primary))}
        {primaryUnmet.length
          ? ` ✗ 未满足（${fmtUnmet(primaryUnmet)}）——起始职业不满足时无法兼职任何职业`
          : ' ✓'}
      </p>

      {mcs.map((m, i) => {
        const lc = loaded.multiclasses[m.classUrl]?.cls
        const entry = book.index.classes.find(c => c.url === m.classUrl)
        const unmet = lc ? unmetPrereq(prereqOf(lc), totals) : []
        const profs = lc ? multiclassProfs(lc) : null
        const profText = profs && [
          profs.weapons, profs.light && '轻甲', profs.medium && '中甲', profs.heavy && '重甲',
          profs.shield && '盾牌', profs.tools,
        ].filter(Boolean).join('、')
        const skillOpts = profs?.skillChoices === 'any' ? SKILL_KEYS : (profs?.skillChoices ?? null)
        return (
          <div key={m.classUrl} className="mc-row">
            <div className="feat-slot">
              <b>{entry?.title ?? '…'}</b>
              <span className="stepper">
                <button
                  disabled={m.level <= 1}
                  onClick={() => setMc(i, { level: m.level - 1 })}
                >−</button>
                <b>{m.level} 级</b>
                <button
                  disabled={choices.level >= 20}
                  onClick={() => setMc(i, { level: m.level + 1 })}
                >＋</button>
              </span>
              {entry && entry.subclasses.length > 0 && (
                <select
                  value={m.subclassUrl}
                  onChange={e => setMc(i, { subclassUrl: e.target.value })}
                >
                  <option value="">— 子职 —</option>
                  {entry.subclasses.map(sc => (
                    <option key={sc.url} value={sc.url}>{sc.title}</option>
                  ))}
                </select>
              )}
              {skillOpts && (
                <select
                  value={m.skill ?? ''}
                  onChange={e => setMc(i, { skill: (e.target.value || null) as SkillKey | null })}
                >
                  <option value="">— 兼职技能 —</option>
                  {skillOpts.map(k => <option key={k} value={k}>{SKILL_CN[k]}</option>)}
                </select>
              )}
              <button className="btn small" onClick={() => removeMc(i)}>移除</button>
            </div>
            <p className="meta">
              {lc
                ? <>兼职获得：生命骰 d{lc.hitDie}{profText ? `、${profText}` : ''}（不获得豁免熟练）</>
                : '⏳ 正在载入…'}
            </p>
            {lc && unmet.length > 0 && (
              <p className="meta warn">
                ✗ 不满足 {lc.nameCn} 的兼职先决（{prereqLabel(prereqOf(lc))}；当前 {fmtUnmet(unmet)}）
              </p>
            )}
          </div>
        )
      })}

      {!picking ? (
        <button
          className="btn small"
          disabled={choices.level >= 20 || primaryUnmet.length > 0}
          title={primaryUnmet.length ? '起始职业不满足兼职先决' : ''}
          onClick={() => setPicking(true)}
        >
          ＋ 添加兼职
        </button>
      ) : (
        <div className="mc-picker">
          <div className="meta">
            选择要兼职的职业（新职业与所有当前职业的主要属性都需 ≥13；灰色为不满足）：
          </div>
          <div className="chip-row">
            {pool.map(c => {
              const cd = candidates[c.url]
              if (cd === 'loading' || cd === undefined) {
                return <span key={c.url} className="chip small">{c.title} ⏳</span>
              }
              if (cd === 'error') {
                return (
                  <button
                    key={c.url}
                    className="chip small"
                    title="载入失败，点击重试"
                    onClick={() => {
                      setCandidates(p => ({ ...p, [c.url]: 'loading' }))
                      loadClassEntity(book.meta, c.url)
                        .then(cd2 => setCandidates(p => ({ ...p, [c.url]: cd2 })))
                        .catch(() => setCandidates(p => ({ ...p, [c.url]: 'error' })))
                    }}
                  >
                    {c.title} ⚠ 重试
                  </button>
                )
              }
              const blockers = multiclassBlockers(currentClasses, cd, totals)
              const reason = blockers
                .map(b => `${b.cls.nameCn}需要${prereqLabel(prereqOf(b.cls))}（当前${fmtUnmet(b.unmet)}）`)
                .join('；')
              return (
                <button
                  key={c.url}
                  className="chip small"
                  disabled={blockers.length > 0}
                  title={blockers.length ? reason : `先决：${prereqLabel(prereqOf(cd))} ✓`}
                  onClick={() => addClass(c.url)}
                >
                  {c.title}
                  <span className="tag">{prereqLabel(prereqOf(cd))}</span>
                </button>
              )
            })}
          </div>
          <button className="btn small" onClick={() => setPicking(false)}>取消</button>
        </div>
      )}
    </div>
  )
}
