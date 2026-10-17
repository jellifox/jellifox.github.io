import { useMemo } from 'react'
import type { AbilityKey } from '../../types'
import { ABILITY_CN, SKILL_CN, RARE_LANGUAGES, STANDARD_LANGUAGES } from '../../data/mappings'
import { effectiveBgChoice, effectiveSubrace, speciesTraits } from '../../rules/build'
import { effectiveTraitOption, traitTables } from '../../rules/spells'
import { deriveCharacter } from '../../rules/character'
import { LANGUAGE_PICKS, toolOptions } from '../../rules/skills'
import { EntityStatus, Section, type PanelProps } from '../ui'

// ---------- 第二步：起源（种族 + 背景 + 语言） ----------

export function OriginPanel({ book, choices, update, loaded, flags }: PanelProps) {
  const species = loaded.species
  const bg = loaded.background
  const d = useMemo(() => deriveCharacter(choices, loaded), [choices, loaded])
  const toolOpts = bg ? toolOptions(bg.tool) : null
  // 自选语言：不含通用语与特性赋予的
  const freeLangs = choices.languages.filter(l => l !== '通用语' && !d.grantedLanguages.includes(l))

  function toggleLanguage(lang: string) {
    update(prev => ({
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang],
    }))
  }

  return (
    <Section step="二" title="确定起源" hint="种族给特质，背景给属性加值与专长（2024 规则）">
      <div className="grid3">
        <label>
          种族（{book.index.speciesGroups.reduce((n, g) => n + g.entries.length, 0)} 个可选）
          <select
            value={choices.speciesUrl}
            onChange={e => update({ speciesUrl: e.target.value, sizeChoice: '' })}
          >
            <option value="">— 选择种族 —</option>
            {book.index.speciesGroups.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.entries.map(s => (
                  <option key={s.url} value={s.url}>
                    {s.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          背景（{book.index.backgroundGroups.reduce((n, g) => n + g.entries.length, 0)} 个可选）
          <select
            value={choices.backgroundUrl}
            onChange={e =>
              update({ backgroundUrl: e.target.value, bgEquipChoice: 0, bgPlus2: null, bgPlus1: null })
            }
          >
            <option value="">— 选择背景 —</option>
            {book.index.backgroundGroups.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.entries.map(b => (
                  <option key={b.url} value={b.url}>
                    {b.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <EntityStatus flag={flags.species} />

      {species && (
        <>
          <div className="kv-grid">
            <span>种族</span><b>{species.nameCn} {species.nameEn}</b>
            <span>生物类型</span><b>{species.creatureType}</b>
            <span>速度</span><b>{species.speed} 尺</b>
            <span>体型</span>
            <b>
              {species.sizeOptions.length > 1 ? (
                species.sizeOptions.map(s => (
                  <label key={s} className="inline-radio">
                    <input
                      type="radio"
                      name="size"
                      checked={(choices.sizeChoice || species.sizeOptions[0]) === s}
                      onChange={() => update({ sizeChoice: s })}
                    />
                    {s}
                  </label>
                ))
              ) : (
                species.sizeOptions[0]
              )}
            </b>
          </div>
          {(species.subraces ?? []).length > 0 && (
            <label>
              亚种（{(species.subraces ?? []).length} 个可选，其特质叠加在共通特质之上）
              <select
                value={effectiveSubrace(species, choices.subraceChoice)}
                onChange={e => update({ subraceChoice: e.target.value })}
              >
                {(species.subraces ?? []).map(s => (
                  <option key={s.name} value={s.name}>
                    {s.name}（{s.traits.length} 项特质）
                  </option>
                ))}
              </select>
            </label>
          )}
          {traitTables(speciesTraits(species, effectiveSubrace(species, choices.subraceChoice))).map(tb => (
            <label key={tb.traitName}>
              {tb.traitName}（选定后按等级获得对应法术/增益）
              <select
                value={effectiveTraitOption(tb, choices.traitOptions[tb.traitName])}
                onChange={e =>
                  update(prev => ({
                    traitOptions: { ...prev.traitOptions, [tb.traitName]: e.target.value },
                  }))
                }
              >
                {tb.rows.map(r => (
                  <option key={r.name} value={r.name}>{r.name}</option>
                ))}
              </select>
            </label>
          ))}
          <details className="traits">
            <summary>
              种族特质（{speciesTraits(species, effectiveSubrace(species, choices.subraceChoice)).length} 项，自动写入角色卡）
            </summary>
            {speciesTraits(species, effectiveSubrace(species, choices.subraceChoice)).map((t, i) => (
              // 共通特质与亚种特质可能重名（如各亚种都有「属性值加成」），需带序号去重
              <p key={`${t.name}-${i}`}>
                <b>{t.name}。</b>
                {t.desc}
              </p>
            ))}
          </details>
        </>
      )}

      <EntityStatus flag={flags.background} />
      {bg && (
        <>
          <div className="kv-grid">
            <span>背景</span><b>{bg.nameCn} {bg.nameEn}</b>
            <span>可加值属性</span><b>{bg.abilities.map(k => ABILITY_CN[k]).join('、') || '—'}</b>
            <span>起源专长</span><b>{bg.feat || '—'}</b>
            <span>技能熟练</span><b>{bg.skills.map(s => SKILL_CN[s]).join('、')}（自动获得）</b>
            <span>工具熟练</span>
            {toolOpts ? (
              <select value={toolOpts.includes(choices.toolChoice) ? choices.toolChoice : ''} onChange={e => update({ toolChoice: e.target.value })}>
                <option value="">{bg.tool}</option>
                {toolOpts.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : (
              <b>{bg.tool || '—'}</b>
            )}
          </div>

          {bg.abilities.length > 0 && (
            <>
              <div className="field-label">属性值加成分配</div>
              <div className="bonus-row">
                <label className="inline-radio">
                  <input
                    type="radio"
                    checked={choices.bgBonusMode === '2+1'}
                    onChange={() => update({ bgBonusMode: '2+1' })}
                  />
                  +2 / +1
                </label>
                <label className="inline-radio">
                  <input
                    type="radio"
                    checked={choices.bgBonusMode === '1+1+1'}
                    onChange={() => update({ bgBonusMode: '1+1+1' })}
                  />
                  三项各 +1
                </label>
                {choices.bgBonusMode === '2+1' && (() => {
                  const { plus2, plus1 } = effectiveBgChoice(choices, bg)
                  return (
                    <>
                      <select
                        value={plus2 ?? ''}
                        onChange={e => {
                          const v = e.target.value as AbilityKey
                          // 若 +1 与新的 +2 撞车，自动把 +1 挪到另一项
                          const p1 =
                            plus1 === v ? bg.abilities.find(k => k !== v) ?? null : plus1
                          update({ bgPlus2: v, bgPlus1: p1 })
                        }}
                      >
                        {bg.abilities.map(k => (
                          <option key={k} value={k}>+2 {ABILITY_CN[k]}</option>
                        ))}
                      </select>
                      <select
                        value={plus1 ?? ''}
                        onChange={e => update({ bgPlus1: e.target.value as AbilityKey })}
                      >
                        {bg.abilities
                          .filter(k => k !== plus2)
                          .map(k => (
                            <option key={k} value={k}>+1 {ABILITY_CN[k]}</option>
                          ))}
                      </select>
                    </>
                  )
                })()}
              </div>
            </>
          )}

          {bg.equipmentOptions.length > 0 && (
            <>
              <div className="field-label">背景装备</div>
              <div className="radio-list">
                {bg.equipmentOptions.map((opt, i) => (
                  <label key={i} className="radio-item">
                    <input
                      type="radio"
                      name="bg-equip"
                      checked={choices.bgEquipChoice === i}
                      onChange={() => update({ bgEquipChoice: i })}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="field-label">
        语言：通用语{d.grantedLanguages.length ? ` + 特性赋予（${d.grantedLanguages.join('、')}）` : ''}
        {' '}+ 自选 {LANGUAGE_PICKS} 种（已选 {freeLangs.length}）
      </div>
      {(['标准语言', '稀有语言（通常来自种族/职业/背景特性）'] as const).map((label, gi) => (
        <div key={label}>
          <div className="field-label">{label}</div>
          <div className="chip-row">
            {(gi === 0 ? STANDARD_LANGUAGES.map(name => ({ name, origin: '' })) : RARE_LANGUAGES).map(({ name, origin }) => {
              const granted = name === '通用语' || d.grantedLanguages.includes(name)
              const on = granted || choices.languages.includes(name)
              return (
                <button
                  key={name}
                  className={`chip small ${on ? 'active' : ''}`}
                  disabled={granted || (!on && freeLangs.length >= LANGUAGE_PICKS)}
                  title={granted ? '已自动获得' : origin ? `起源：${origin}` : undefined}
                  onClick={() => toggleLanguage(name)}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </Section>
  )
}
