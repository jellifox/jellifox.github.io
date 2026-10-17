import { useEffect } from 'react'
import type { AbilityKey, CharacterChoices } from '../../types'
import { ABILITY_CN, ABILITY_KEYS, cnToAbilities } from '../../data/mappings'
import {
  POINT_BUY_BUDGET, STANDARD_ARRAY, abilityMod, fmtMod, hpPerLevelAverage, pointBuyCost,
  proficiencyBonus, roll4d6DropLowest, rollDie,
} from '../../rules/rules'
import {
  bonusSources, deriveAbilities, deriveHp, effectiveScheme, effectiveSubrace, pendingBonuses,
  speciesTraits,
} from '../../rules/build'
import { NumberField, Section, type PanelProps } from '../ui'

// ---------- 第三步：属性值 ----------

export function AbilityPanel({
  choices,
  update,
  loaded,
}: Pick<PanelProps, 'choices' | 'update' | 'loaded'>) {
  const ab = deriveAbilities(choices, loaded.background, loaded.species, loaded)
  const pending = pendingBonuses(choices, loaded)
  const sources = bonusSources(choices, loaded)
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

      {(sources.some(x => x.spec.schemes.length > 1) || pending.length > 0) && (
        <div className="bonus-alloc">
          <div className="field-label">属性加值分配（来自种族与专长）</div>
          {sources.filter(x => x.spec.schemes.length > 1).map(src => (
            <div className="feat-slot" key={src.key}>
              <span className="feat-slot-label">{src.source} · 方案</span>
              <select
                value={effectiveScheme(src, choices.bonusSchemes[src.key])}
                onChange={e =>
                  update(prev => ({
                    bonusSchemes: { ...prev.bonusSchemes, [src.key]: parseInt(e.target.value, 10) },
                  }))
                }
              >
                {src.spec.schemes.map((sc, i) => (
                  <option key={i} value={i}>
                    {sc.map(x => `+${x.amount}`).join(' 与 ')}（{sc.length} 项）
                  </option>
                ))}
              </select>
            </div>
          ))}
          {pending.map(pb => (
            <div className="feat-slot" key={pb.key}>
              <span className="feat-slot-label">{pb.source} · +{pb.amount} 给</span>
              <select
                value={choices.abilityPicks[pb.key] ?? ''}
                onChange={e =>
                  update(prev => ({
                    abilityPicks: {
                      ...prev.abilityPicks,
                      [pb.key]: (e.target.value || null) as AbilityKey | null,
                    },
                  }))
                }
              >
                <option value="">— 未指定 —</option>
                {(pb.options.length ? pb.options : ABILITY_KEYS).map(k => (
                  <option key={k} value={k}>{ABILITY_CN[k]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <table className="ability-table">
        <thead>
          <tr>
            <th>属性</th>
            <th>基础值</th>
            <th>种族/背景</th>
            <th>成长</th>
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
              <td className="bonus-cell">{ab.growth[k] > 0 ? `+${ab.growth[k]}` : '—'}</td>
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
  const hp = deriveHp(choices, loaded, spTraits, conMod)
  // 每一级各自的生命骰（兼职时不同职业的级用不同骰子）；hpRolls[i] 对应 dice[i+1]
  const dice = hp.dice
  const need = Math.max(0, dice.length - 1)
  const dieOf = (i: number) => dice[i + 1] ?? hp.hitDie
  const multiDie = new Set(dice).size > 1

  // 投骰模式下升级后补投新增等级（已投出的结果保持不变，不会因升级被重置）
  useEffect(() => {
    if (choices.hpMethod !== 'roll' || choices.hpRolls.length >= need) return
    update(prev => ({
      hpRolls: [
        ...prev.hpRolls,
        ...Array.from({ length: need - prev.hpRolls.length }, (_, k) => rollDie(dieOf(prev.hpRolls.length + k))),
      ],
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices.hpMethod, need, dice.join(',')])

  /** 为 2..level 各投一次生命骰，每级用该级所属职业的骰子 */
  function rollAll() {
    update({
      hpMethod: 'roll',
      hpRolls: Array.from({ length: need }, (_, i) => rollDie(dieOf(i))),
    })
  }
  function rerollOne(i: number) {
    update(prev => {
      const rolls = [...prev.hpRolls]
      rolls[i] = rollDie(dieOf(i))
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
        1级取起始职业生命骰最大值 D{hp.hitDie} = {hp.hitDie}，之后每级
        {choices.hpMethod === 'roll' ? ' 投该级职业的生命骰' : ' 取该级职业生命骰的平均值'}
        {multiDie && '（兼职职业从其第一级起就按升级计算，不取最大值）'}
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
          {need > 0 && (
            <div className="chip-row">
              {Array.from({ length: need }, (_, i) => (
                <button
                  key={i}
                  className="chip small"
                  title={`第 ${i + 2} 级，d${dieOf(i)}，点击重投`}
                  onClick={() => rerollOne(i)}
                >
                  {i + 2}级{multiDie ? `·d${dieOf(i)}` : ''} {choices.hpRolls[i] ?? hpPerLevelAverage(dieOf(i))}
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
