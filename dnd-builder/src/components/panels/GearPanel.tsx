import { ARMORS, WEAPONS } from '../../rules/rules'
import { Section, type PanelProps } from '../ui'

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
