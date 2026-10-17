import { useMemo } from 'react'
import { ABILITY_CN, SKILL_ABILITY, SKILL_CN, SKILL_KEYS } from '../../data/mappings'
import { deriveCharacter } from '../../rules/character'
import { fmtMod } from '../../rules/rules'
import type { SkillKey } from '../../types'
import { Section, type PanelProps } from '../ui'

// ---------- 附：技能（种族/专长自选熟练、专精、总览） ----------

export function SkillPanel({
  choices,
  update,
  loaded,
}: Pick<PanelProps, 'choices' | 'update' | 'loaded'>) {
  const d = useMemo(() => deriveCharacter(choices, loaded), [choices, loaded])

  function togglePick(key: string, s: SkillKey) {
    update(prev => {
      const cur = prev.skillPicks?.[key] ?? []
      return { skillPicks: { ...prev.skillPicks, [key]: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s] } }
    })
  }
  function toggleExpertise(s: SkillKey) {
    update(prev => {
      const cur = prev.expertise ?? []
      return { expertise: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s] }
    })
  }

  return (
    <Section step="附" title="技能" hint="熟练 ●  专精 ◆  万事通 ½">
      {d.skillChoices.map(ch => {
        const picked = (choices.skillPicks?.[ch.key] ?? [])
          .filter(s => !ch.options || ch.options.includes(s)).slice(0, ch.count)
        return (
          <div key={ch.key}>
            <div className="field-label">
              {ch.source}：自选 {ch.count} 项技能熟练（已选 {picked.length}）
            </div>
            <div className="chip-row">
              {(ch.options ?? SKILL_KEYS).map(s => {
                const on = picked.includes(s)
                // 别处已熟练的技能再选就浪费了
                const dup = !on && d.profSkills.has(s)
                return (
                  <button
                    key={s}
                    className={`chip small ${on ? 'active' : ''}`}
                    disabled={dup || (!on && picked.length >= ch.count)}
                    onClick={() => togglePick(ch.key, s)}
                    title={dup ? '已从其他来源获得熟练' : `关联属性：${ABILITY_CN[SKILL_ABILITY[s]]}`}
                  >
                    {SKILL_CN[s]}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {d.expertiseCount > 0 && (
        <>
          <div className="field-label">
            专精（已选 {d.expertise.length}/{d.expertiseCount}，须为已熟练技能）
            <span className="meta">　{d.expertiseSources.map(s => `${s.source} ${s.count}`).join('、')}</span>
          </div>
          <div className="chip-row">
            {SKILL_KEYS.filter(s => d.profSkills.has(s)).map(s => {
              const on = d.expertise.includes(s)
              return (
                <button
                  key={s}
                  className={`chip small ${on ? 'active' : ''}`}
                  disabled={!on && d.expertise.length >= d.expertiseCount}
                  onClick={() => toggleExpertise(s)}
                >
                  {SKILL_CN[s]}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="skill-grid">
        {SKILL_KEYS.map(s => (
          <span key={s} className={d.profSkills.has(s) ? '' : 'meta'}>
            {d.expertise.includes(s) ? '◆' : d.profSkills.has(s) ? '●' : d.jack ? '½' : '○'}{' '}
            {SKILL_CN[s]}（{ABILITY_CN[SKILL_ABILITY[s]]}） <b>{fmtMod(d.skillBonus[s])}</b>
          </span>
        ))}
      </div>
      <p className="meta">先攻 {fmtMod(d.initiative)} · 被动察觉 {d.passivePerception}</p>
    </Section>
  )
}
