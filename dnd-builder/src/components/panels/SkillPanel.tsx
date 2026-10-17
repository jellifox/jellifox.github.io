import { useMemo } from 'react'
import { ABILITY_CN, SKILL_ABILITY, SKILL_CN, SKILL_KEYS } from '../../data/mappings'
import { deriveCharacter } from '../../rules/character'
import { validPicks } from '../../rules/skills'
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
  function toggleExpertise(key: string, s: SkillKey) {
    update(prev => {
      const cur = prev.expertisePicks?.[key] ?? []
      return { expertisePicks: { ...prev.expertisePicks, [key]: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s] } }
    })
  }

  return (
    <Section step="附" title="技能" hint="熟练 ●  专精 ◆  万事通 ½">
      {d.skillChoices.map(ch => {
        const picked = validPicks(ch, choices.skillPicks)
        return (
          <div key={ch.key}>
            <div className="field-label">
              {ch.source}：自选 {ch.count} 项技能熟练（已选 {picked.length}）
              {ch.upgrade && '；选已熟练的技能则改为获得专精'}
            </div>
            <div className="chip-row">
              {(ch.options ?? SKILL_KEYS).map(s => {
                const on = picked.includes(s)
                // 别处已熟练的技能再选就浪费了
                const dup = !on && d.profSkills.has(s) && !ch.upgrade
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

      {d.expertiseSources.map(src => {
        const ok = d.expertiseBySource[src.key] ?? []
        return (
          <div key={src.key}>
            <div className="field-label">
              {src.source}：专精 {src.count} 项（已选 {ok.length}，须为已熟练技能
              {src.options ? `；限 ${src.options.map(s => SKILL_CN[s]).join('、')}` : ''}）
            </div>
            <div className="chip-row">
              {SKILL_KEYS.filter(s => d.profSkills.has(s) && (!src.options || src.options.includes(s))).map(s => {
                const on = ok.includes(s)
                // 已在别处获得专精的技能不能重复选
                const taken = !on && d.expertise.includes(s)
                return (
                  <button
                    key={s}
                    className={`chip small ${on ? 'active' : ''}`}
                    disabled={taken || (!on && ok.length >= src.count)}
                    title={taken ? '已从其他来源获得专精' : undefined}
                    onClick={() => toggleExpertise(src.key, s)}
                  >
                    {SKILL_CN[s]}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

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
