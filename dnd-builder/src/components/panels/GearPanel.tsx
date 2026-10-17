import { useMemo } from 'react'
import { deriveCharacter } from '../../rules/character'
import { ARMORS, WEAPONS, armorTrained, fmtMod, weaponProficient } from '../../rules/rules'
import { Section, type PanelProps } from '../ui'

// ---------- 第四步：装备 ----------

export function GearPanel({
  choices,
  update,
  loaded,
}: Pick<PanelProps, 'choices' | 'update' | 'loaded'>) {
  const d = useMemo(() => deriveCharacter(choices, loaded), [choices, loaded])
  const liveMastery = d.masteryIds

  function toggle(key: 'weaponIds' | 'masteryIds', id: string) {
    update(prev => {
      const cur = prev[key] ?? []
      return { [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] }
    })
  }

  return (
    <Section step="四" title="护甲与武器" hint="武器自动生成攻击动作（含属性、熟练与战斗风格加值）">
      <div className="grid3">
        <label>
          护甲
          <select value={choices.armorId} onChange={e => update({ armorId: e.target.value })}>
            {(['无甲', '轻甲', '中甲', '重甲'] as const).map(cat => (
              <optgroup key={cat} label={cat}>
                {ARMORS.filter(a => a.category === cat).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nameCn}（AC {a.base}
                    {a.addDex ? (a.maxDex != null ? `+敏捷上限${a.maxDex}` : '+敏捷') : ''}
                    {a.strReq ? `，力量${a.strReq}` : ''}）
                    {armorTrained(a, d.profs) ? '' : ' · 未受训'}
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
          盾牌（AC +2{d.profs.shield ? '' : '，未受训'}）
        </label>
        <div className="meta">
          AC <b>{d.ac}</b> · 速度 {d.speed} 尺
        </div>
      </div>
      {d.armorNotes.length > 0 && <p className="meta">{d.armorNotes.join('；')}</p>}

      <div className="field-label">武器（可多选，灰色为未熟练）</div>
      <div className="chip-row">
        {WEAPONS.map(w => {
          const prof = weaponProficient(w, d.profs.weapons)
          return (
            <button
              key={w.id}
              className={`chip small ${choices.weaponIds.includes(w.id) ? 'active' : ''} ${prof ? '' : 'muted'}`}
              onClick={() => toggle('weaponIds', w.id)}
              title={`${w.martial ? '军用' : '简易'} · ${w.dice} ${w.damageType} · 精通 ${w.mastery}${w.finesse ? ' · 灵巧' : ''}${w.ranged ? ` · 射程${w.range}` : ''}${prof ? '' : ' · 未熟练'}`}
            >
              {w.nameCn} {w.dice}
            </button>
          )
        })}
      </div>
      {d.weapons.length > 0 && (
        <p className="meta">
          {d.weapons.map(w => `${w.def.nameCn} ${fmtMod(w.attackBonus)} 命中，${w.def.dice}${w.damageBonus ? fmtMod(w.damageBonus) : ''}`).join('；')}
        </p>
      )}

      {d.masteryCount > 0 && (
        <>
          <div className="field-label">
            武器精通（已选 {liveMastery.length}/{d.masteryCount}，长休后可替换）
          </div>
          <div className="chip-row">
            {WEAPONS.filter(w => weaponProficient(w, d.profs.weapons)).map(w => {
              const on = liveMastery.includes(w.id)
              return (
                <button
                  key={w.id}
                  className={`chip small ${on ? 'active' : ''}`}
                  disabled={!on && liveMastery.length >= d.masteryCount}
                  onClick={() => toggle('masteryIds', w.id)}
                >
                  {w.nameCn}·{w.mastery}
                </button>
              )
            })}
          </div>
        </>
      )}
    </Section>
  )
}
