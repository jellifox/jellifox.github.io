import { ALIGNMENTS } from '../../data/mappings'
import { multiclassLevelSum } from '../../rules/multiclass'
import { NumberField, Section, type PanelProps } from '../ui'

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
          {multiclassLevelSum(choices) > 0 ? '总等级（含兼职）' : '等级（1-20）'}
          <NumberField
            value={choices.level}
            // 兼职时起始职业至少保留 1 级
            min={multiclassLevelSum(choices) + 1}
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
