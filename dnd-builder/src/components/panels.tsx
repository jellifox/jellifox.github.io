import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AbilityKey, CharacterChoices, FeatPage, LoadedEntities, SkillKey,
} from '../types'
import { loadFeatPageEntity, type BookData } from '../data/loader'
import type { EntityFlags } from '../App'
import {
  ABILITY_CN, ABILITY_KEYS, ALIGNMENTS, SKILL_ABILITY, SKILL_CN, SKILL_KEYS,
  RARE_LANGUAGES, STANDARD_LANGUAGES, cnToAbilities,
} from '../data/mappings'
import {
  ARMORS, POINT_BUY_BUDGET, STANDARD_ARRAY, WEAPONS, abilityMod, fmtMod,
  hpPerLevelAverage, pointBuyCost, proficiencyBonus, roll4d6DropLowest, rollDie,
} from '../rules/rules'
import {
  deriveAbilities, deriveHp, effectiveBgChoice, effectiveSubrace, featSlots,
  speciesAbilityBonus, speciesTraits, type FeatSlot,
} from '../rules/build'

interface PanelProps {
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

function EntityStatus({ flag }: { flag: 'loading' | string | undefined }) {
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
function NumberField({
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

// ---------- 基本信息 ----------

export function BasicsPanel({
  choices,
  update,
}: Pick<PanelProps, 'choices' | 'update'>) {
  return (
    <Section step="始" title="基本信息">
      <div className="grid3">
        <label>
          角色名
          <input
            value={choices.name}
            placeholder="输入角色名…"
            onChange={e => update({ name: e.target.value })}
          />
        </label>
        <label>
          等级（1-20）
          <NumberField
            value={choices.level}
            min={1}
            max={20}
            onCommit={v => update({ level: v ?? choices.level })}
          />
        </label>
        <label>
          阵营
          <select value={choices.alignment} onChange={e => update({ alignment: e.target.value })}>
            {ALIGNMENTS.map(a => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        备注 / 角色描述
        <input
          value={choices.about}
          placeholder="外貌、性格、羁绊…（可选）"
          onChange={e => update({ about: e.target.value })}
        />
      </label>
    </Section>
  )
}

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
              update({
                classUrl: c.url,
                subclassUrl: '',
                classSkills: [],
                classEquipChoice: 0,
                spells: [],
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
        </>
      )}
    </Section>
  )
}

// ---------- 第二步：起源（种族 + 背景 + 语言） ----------

export function OriginPanel({ book, choices, update, loaded, flags }: PanelProps) {
  const species = loaded.species
  const bg = loaded.background

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
            <span>工具熟练</span><b>{bg.tool || '—'}</b>
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

      <div className="field-label">标准语言（通用语 + 任选 2 种）</div>
      <div className="chip-row">
        {STANDARD_LANGUAGES.map(lang => (
          <button
            key={lang}
            className={`chip small ${choices.languages.includes(lang) ? 'active' : ''}`}
            disabled={lang === '通用语'}
            onClick={() => toggleLanguage(lang)}
          >
            {lang}
          </button>
        ))}
      </div>

      <div className="field-label">稀有语言（通常来自种族/职业/背景特性）</div>
      <div className="chip-row">
        {RARE_LANGUAGES.map(({ name, origin }) => (
          <button
            key={name}
            className={`chip small ${choices.languages.includes(name) ? 'active' : ''}`}
            title={`起源：${origin}`}
            onClick={() => toggleLanguage(name)}
          >
            {name}
          </button>
        ))}
      </div>
    </Section>
  )
}

// ---------- 第三步：属性值 ----------

export function AbilityPanel({
  choices,
  update,
  loaded,
}: Pick<PanelProps, 'choices' | 'update' | 'loaded'>) {
  const ab = deriveAbilities(choices, loaded.background, loaded.species)
  const spBonus = speciesAbilityBonus(loaded.species, choices.subraceChoice)
  const cls = loaded.cls
  const bg = loaded.background

  const selectedRoll =
    choices.rollSetIndex >= 0 ? choices.rolledSets[choices.rollSetIndex] ?? [] : []
  const pool =
    choices.abilityMethod === 'array'
      ? STANDARD_ARRAY
      : choices.abilityMethod === 'roll'
        ? selectedRoll
        : []

  // 多重集合语义：某数值剩余可用次数
  function remainingOf(value: number, except: AbilityKey): number {
    let total = pool.filter(v => v === value).length
    for (const k of ABILITY_KEYS) {
      if (k !== except && choices.baseScores[k] === value) total--
    }
    return total
  }

  const pointsUsed = ABILITY_KEYS.reduce(
    (sum, k) => sum + pointBuyCost(choices.baseScores[k] ?? 8),
    0
  )

  function setScore(k: AbilityKey, v: number | null) {
    update({ baseScores: { ...choices.baseScores, [k]: v } })
  }

  function switchMethod(m: CharacterChoices['abilityMethod']) {
    // 切到自定义时保留当前数值（便于在任一模式基础上微调），其余模式重置
    if (m === 'custom') return update({ abilityMethod: m })
    update({
      abilityMethod: m,
      baseScores:
        m === 'pointbuy'
          ? { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }
          : { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
    })
  }

  function rollSets() {
    const sets = Array.from({ length: 5 }, () =>
      Array.from({ length: 6 }, roll4d6DropLowest).sort((a, b) => b - a)
    )
    update({
      rolledSets: sets,
      rollSetIndex: -1,
      baseScores: { STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null },
    })
  }

  /** 按职业主属性自动分配：主属性最高，体质次之 */
  function autoAssign() {
    // 投骰模式下必须先选定一组
    if (choices.abilityMethod === 'roll' && selectedRoll.length !== 6) return
    const primary = cls ? cnToAbilities(cls.primaryAbility) : []
    const priority: AbilityKey[] = []
    for (const k of primary) if (!priority.includes(k)) priority.push(k)
    for (const k of ['CON', 'DEX', 'WIS', 'CHA', 'INT', 'STR'] as AbilityKey[]) {
      if (!priority.includes(k)) priority.push(k)
    }
    const source =
      choices.abilityMethod === 'roll' && selectedRoll.length === 6
        ? [...selectedRoll]
        : [...STANDARD_ARRAY]
    source.sort((a, b) => b - a)
    const scores = { ...choices.baseScores }
    priority.forEach((k, i) => {
      scores[k] = source[i]
    })
    const patch: Partial<CharacterChoices> = { baseScores: scores }
    if (choices.abilityMethod === 'pointbuy') patch.abilityMethod = 'array'
    // 背景加值也顺手指给主属性
    if (bg && bg.abilities.length > 0) {
      const p2 = priority.find(k => bg.abilities.includes(k)) ?? bg.abilities[0]
      const p1 =
        priority.find(k => k !== p2 && bg.abilities.includes(k)) ??
        bg.abilities.find(k => k !== p2) ??
        null
      patch.bgBonusMode = '2+1'
      patch.bgPlus2 = p2
      patch.bgPlus1 = p1
    }
    update(patch)
  }

  return (
    <Section step="三" title="确定属性值" hint="背景加值自动计入总值">
      <div className="bonus-row">
        <label className="inline-radio">
          <input
            type="radio"
            checked={choices.abilityMethod === 'array'}
            onChange={() => switchMethod('array')}
          />
          标准数组（15/14/13/12/10/8）
        </label>
        <label className="inline-radio">
          <input
            type="radio"
            checked={choices.abilityMethod === 'pointbuy'}
            onChange={() => switchMethod('pointbuy')}
          />
          购点（27 点）
        </label>
        <label className="inline-radio">
          <input
            type="radio"
            checked={choices.abilityMethod === 'roll'}
            onChange={() => switchMethod('roll')}
          />
          投骰（4d6 取 3）
        </label>
        <label className="inline-radio">
          <input
            type="radio"
            checked={choices.abilityMethod === 'custom'}
            onChange={() => switchMethod('custom')}
          />
          自定义（直接填写）
        </label>
        <button
          className="btn small"
          onClick={autoAssign}
          disabled={
            choices.abilityMethod === 'custom' ||
            (choices.abilityMethod === 'roll' && selectedRoll.length !== 6)
          }
          title="主属性最高、体质次之，背景加值同步指向主属性"
        >
          ⚡ 按职业自动分配
        </button>
      </div>

      {choices.abilityMethod === 'roll' && (
        <div className="roll-area">
          <div className="bonus-row">
            <button className="btn small" onClick={rollSets}>🎲 投 5 组（4d6 取高 3）</button>
            <span className="meta">
              {choices.rolledSets.length === 0
                ? '点击投出 5 组候选数组，选定一组后再自动分配'
                : choices.rollSetIndex >= 0
                  ? `已选用第 ${choices.rollSetIndex + 1} 组`
                  : '请选择要使用的一组 ↓'}
            </span>
          </div>
          {choices.rolledSets.map((set, i) => {
            const total = set.reduce((a, b) => a + b, 0)
            return (
              <label key={i} className={`roll-set ${choices.rollSetIndex === i ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="roll-set"
                  checked={choices.rollSetIndex === i}
                  onChange={() =>
                    update({
                      rollSetIndex: i,
                      baseScores: {
                        STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null,
                      },
                    })
                  }
                />
                <span className="roll-values">
                  {set.map((v, j) => (
                    <b key={j}>{v}</b>
                  ))}
                </span>
                <span className="meta">合计 {total}</span>
              </label>
            )
          })}
        </div>
      )}
      {choices.abilityMethod === 'pointbuy' && (
        <div className="meta">
          已用 {pointsUsed} / {POINT_BUY_BUDGET} 点
          {pointsUsed > POINT_BUY_BUDGET && <span className="warn">（超出预算！）</span>}
        </div>
      )}
      {choices.abilityMethod === 'custom' && (
        <div className="meta">
          自定义模式：不受标准数组/购点限制，可填 1–30（背景加值仍会计入总值）。
        </div>
      )}

      {spBonus.flexible.length > 0 && (
        <div className="bonus-row">
          <span className="meta">种族自选加值：</span>
          {spBonus.flexible.map((amt, i) => (
            <label key={i} className="inline-radio">
              +{amt} 给
              <select
                value={choices.speciesPicks[i] ?? ''}
                onChange={e =>
                  update(prev => {
                    const picks = [...prev.speciesPicks]
                    picks[i] = (e.target.value || null) as AbilityKey | null
                    return { speciesPicks: picks }
                  })
                }
              >
                <option value="">— 未指定 —</option>
                {ABILITY_KEYS.map(k => (
                  <option key={k} value={k}>{ABILITY_CN[k]}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <table className="ability-table">
        <thead>
          <tr>
            <th>属性</th>
            <th>基础值</th>
            <th>加值合计</th>
            <th>总值</th>
            <th>调整值</th>
          </tr>
        </thead>
        <tbody>
          {ABILITY_KEYS.map(k => (
            <tr key={k}>
              <td>{ABILITY_CN[k]} {k}</td>
              <td>
                {choices.abilityMethod === 'custom' ? (
                  <NumberField
                    className="score-input"
                    value={choices.baseScores[k]}
                    min={1}
                    max={30}
                    placeholder="10"
                    emptyMeans="null"
                    onCommit={v => setScore(k, v)}
                  />
                ) : choices.abilityMethod === 'pointbuy' ? (
                  <span className="stepper">
                    <button
                      onClick={() => setScore(k, Math.max(8, (choices.baseScores[k] ?? 8) - 1))}
                    >
                      −
                    </button>
                    <b>{choices.baseScores[k] ?? 8}</b>
                    <button
                      disabled={
                        (choices.baseScores[k] ?? 8) >= 15 ||
                        pointsUsed +
                          (pointBuyCost((choices.baseScores[k] ?? 8) + 1) -
                            pointBuyCost(choices.baseScores[k] ?? 8)) >
                          POINT_BUY_BUDGET
                      }
                      onClick={() => setScore(k, Math.min(15, (choices.baseScores[k] ?? 8) + 1))}
                    >
                      ＋
                    </button>
                  </span>
                ) : (
                  <select
                    value={choices.baseScores[k] ?? ''}
                    onChange={e =>
                      setScore(k, e.target.value ? parseInt(e.target.value, 10) : null)
                    }
                  >
                    <option value="">—</option>
                    {[...new Set(pool)].map(v => (
                      <option
                        key={v}
                        value={v}
                        disabled={remainingOf(v, k) <= 0 && choices.baseScores[k] !== v}
                      >
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="bonus-cell">{ab.bonus[k] > 0 ? `+${ab.bonus[k]}` : '—'}</td>
              <td><b>{ab.total[k]}</b></td>
              <td>{fmtMod(abilityMod(ab.total[k]))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="meta">
        熟练加值：{fmtMod(proficiencyBonus(choices.level))}（{choices.level} 级）
      </div>

      <HpBlock choices={choices} update={update} loaded={loaded} ab={ab} />
    </Section>
  )
}

// ---------- 生命值 ----------

function HpBlock({
  choices, update, loaded, ab,
}: Pick<PanelProps, 'choices' | 'update' | 'loaded'> & { ab: ReturnType<typeof deriveAbilities> }) {
  const cls = loaded.cls
  const spTraits = speciesTraits(loaded.species, effectiveSubrace(loaded.species, choices.subraceChoice))
  const conMod = ab.mods.CON
  const hp = deriveHp(choices, cls, spTraits, conMod)
  const perLevelAvg = hpPerLevelAverage(hp.hitDie)

  // 投骰模式下升级后补投新增等级（已投出的结果保持不变，不会因升级被重置）
  const need = Math.max(0, choices.level - 1)
  useEffect(() => {
    if (choices.hpMethod !== 'roll' || choices.hpRolls.length >= need) return
    update(prev => ({
      hpRolls: [
        ...prev.hpRolls,
        ...Array.from({ length: need - prev.hpRolls.length }, () => rollDie(hp.hitDie)),
      ],
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices.hpMethod, need, hp.hitDie])

  /** 为 2..level 各投一次生命骰（保留已有结果，只补/重投全部） */
  function rollAll() {
    update({
      hpMethod: 'roll',
      hpRolls: Array.from({ length: Math.max(0, choices.level - 1) }, () => rollDie(hp.hitDie)),
    })
  }
  function rerollOne(i: number) {
    update(prev => {
      const rolls = [...prev.hpRolls]
      rolls[i] = rollDie(hp.hitDie)
      return { hpRolls: rolls }
    })
  }

  if (!cls) {
    return <div className="meta">生命值：选择职业后按生命骰自动计算。</div>
  }

  return (
    <div className="hp-block">
      <div className="bonus-row">
        <b className="hp-total">生命值上限 {hp.max}</b>
        <label className="inline-radio">
          <input
            type="radio"
            checked={choices.hpMethod === 'average'}
            onChange={() => update({ hpMethod: 'average' })}
          />
          固定平均值
        </label>
        <label className="inline-radio">
          <input
            type="radio"
            checked={choices.hpMethod === 'roll'}
            onChange={() => (choices.hpRolls.length ? update({ hpMethod: 'roll' }) : rollAll())}
          />
          逐级投骰
        </label>
        <label className="inline-radio">
          <input
            type="radio"
            checked={choices.hpMethod === 'manual'}
            onChange={() => update({ hpMethod: 'manual', hpManual: choices.hpManual ?? hp.max })}
          />
          手动指定
        </label>
      </div>

      <div className="meta">
        1级取生命骰最大值 D{hp.hitDie} = {hp.hitDie}，之后每级
        {choices.hpMethod === 'roll' ? ` 投 1d${hp.hitDie}` : ` 取平均 ${perLevelAvg}`}
        ，每级再加体质调整值 {fmtMod(conMod)}
        {hp.bonusPerLevel > 0 && `，另有每级 +${hp.bonusPerLevel}（种族/专长）`}
        {choices.hpMethod === 'manual' && '（手动模式下不叠加任何加成）'}
      </div>

      {choices.hpMethod === 'roll' && (
        <>
          <div className="bonus-row">
            <button className="btn small" onClick={rollAll}>🎲 全部重投</button>
            <span className="meta">点单个骰值可单独重投</span>
          </div>
          {choices.level > 1 && (
            <div className="chip-row">
              {Array.from({ length: choices.level - 1 }, (_, i) => (
                <button
                  key={i}
                  className="chip small"
                  title={`${i + 2} 级，点击重投`}
                  onClick={() => rerollOne(i)}
                >
                  {i + 2}级 {choices.hpRolls[i] ?? perLevelAvg}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {choices.hpMethod === 'manual' && (
        <label>
          生命值上限
          <NumberField
            className="score-input"
            value={choices.hpManual}
            min={1}
            max={999}
            emptyMeans="null"
            onCommit={v => update({ hpManual: v })}
          />
        </label>
      )}
    </div>
  )
}

// ---------- 第四步：装备 ----------

export function GearPanel({
  choices,
  update,
}: Pick<PanelProps, 'choices' | 'update'>) {
  function toggleWeapon(id: string) {
    update(prev => ({
      weaponIds: prev.weaponIds.includes(id)
        ? prev.weaponIds.filter(x => x !== id)
        : [...prev.weaponIds, id],
    }))
  }

  return (
    <Section step="四" title="护甲与武器" hint="武器自动生成攻击动作（含属性加值）">
      <div className="grid3">
        <label>
          护甲
          <select value={choices.armorId} onChange={e => update({ armorId: e.target.value })}>
            {(['无甲', '轻甲', '中甲', '重甲'] as const).map(cat => (
              <optgroup key={cat} label={cat}>
                {ARMORS.filter(a => a.category === cat).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nameCn}（AC {a.base}
                    {a.addDex ? (a.maxDex != null ? `+敏捷上限${a.maxDex}` : '+敏捷') : ''}）
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={choices.shield}
            onChange={e => update({ shield: e.target.checked })}
          />
          盾牌（AC +2）
        </label>
      </div>

      <div className="field-label">武器（可多选）</div>
      <div className="chip-row">
        {WEAPONS.map(w => (
          <button
            key={w.id}
            className={`chip small ${choices.weaponIds.includes(w.id) ? 'active' : ''}`}
            onClick={() => toggleWeapon(w.id)}
            title={`${w.dice} ${w.damageType}${w.finesse ? ' · 灵巧' : ''}${w.ranged ? ` · 远程${w.range}` : ''}`}
          >
            {w.nameCn} {w.dice}
          </button>
        ))}
      </div>
    </Section>
  )
}

// ---------- 第五步：法术（从法术速查中勾选，覆盖全部扩展书） ----------

const RING_NAMES = ['戏法', '一环', '二环', '三环', '四环', '五环', '六环', '七环', '八环', '九环']

// ---------- 专长（按升级列表：槽位由职业等级表推导） ----------

type PageState = FeatPage | 'loading' | `err:${string}`

export function FeatPanel({ book, choices, update, loaded }: PanelProps) {
  const cls = loaded.cls
  const bg = loaded.background
  const slots = featSlots(cls, choices.level)

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
                page.feats.map(f => (
                  <option key={f.name} value={f.name} title={f.desc.slice(0, 300)}>
                    {f.name}
                  </option>
                ))}
            </select>
            {page === 'loading' && <span className="meta">⏳</span>}
            {typeof page === 'string' && page.startsWith('err:') && (
              <span className="meta warn">{page.slice(4)}</span>
            )}
          </div>
        )
      })}
      {cls && slots.length === 0 && (
        <p className="meta">当前等级（{choices.level}）尚无升级专长槽位（首个在 4 级）。</p>
      )}
    </Section>
  )
}

export function SpellPanel({
  choices,
  update,
  loaded,
  flags,
}: Pick<PanelProps, 'choices' | 'update' | 'loaded' | 'flags'>) {
  const [filter, setFilter] = useState('')
  const cls = loaded.cls
  const spellList = loaded.spellList
  const row = cls?.levels.find(r => r.level === choices.level)
  const hasSlots = !!row && (!!row.slots || (row.pactSlots?.count ?? 0) > 0)

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

  if (!cls || (!hasSlots && !spellList)) return null

  const slotChips: string[] = []
  if (row?.slots) {
    for (const [lv, n] of Object.entries(row.slots)) slotChips.push(`${lv}环 ×${n}`)
  }
  if (row?.pactSlots && row.pactSlots.count > 0) {
    slotChips.push(`魔契法术位 ${row.pactSlots.level}环 ×${row.pactSlots.count}（短休回复）`)
  }

  function toggleSpell(name: string) {
    update(prev => ({
      spells: prev.spells.includes(name)
        ? prev.spells.filter(s => s !== name)
        : [...prev.spells, name],
    }))
  }

  return (
    <Section step="五" title="法术" hint="法术列表来自速查，覆盖全部扩展书">
      <div className="kv-grid">
        {slotChips.length > 0 && (<><span>法术位</span><b>{slotChips.join('，')}</b></>)}
        {row?.cantrips != null && (<><span>戏法数</span><b>{row.cantrips}</b></>)}
        {row?.preparedSpells != null && (<><span>准备法术数</span><b>{row.preparedSpells}</b></>)}
        {cls.spellAbility && (<><span>施法属性</span><b>{ABILITY_CN[cls.spellAbility]}</b></>)}
        {choices.spells.length > 0 && (<><span>已选法术</span><b>{choices.spells.length} 个</b></>)}
      </div>

      <EntityStatus flag={flags.spellList} />
      {spellList && (
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
                      className={`chip small ${choices.spells.includes(s.name) ? 'active' : ''}`}
                      title={`${s.school}${s.source ? ` · ${s.source}` : ''}`}
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
