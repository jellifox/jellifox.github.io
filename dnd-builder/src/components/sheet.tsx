import { useState } from 'react'
import type { Action, CharacterChoices, E5Statblock, LoadedEntities } from '../types'
import { SKILL_CN } from '../data/mappings'
import { fmtMod } from '../rules/rules'
import { mianbuanFileName, toMianbuan } from '../rules/mianbuan'
import type { SkillKey } from '../types'

function download(text: string, filename: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function StatCell({ label, value }: { label: string; value: number | null | undefined }) {
  const v = value ?? 10
  return (
    <div className="stat-cell">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{v}</div>
      <div className="stat-mod">{fmtMod(Math.floor((v - 10) / 2))}</div>
    </div>
  )
}

function ActionBlock({ title, list }: { title: string; list: Action[] | undefined }) {
  if (!list || list.length === 0) return null
  return (
    <>
      <h3 className="sheet-section">{title}</h3>
      {list.map((a, i) => (
        <details key={i} className="action-entry" open={a.desc.length < 100}>
          <summary>
            <b>{a.name}</b>
            {a.attack_bonus != null && <span className="atk"> 攻击 {fmtMod(a.attack_bonus)}</span>}
            {a.damage_dice && <span className="atk"> 伤害 {a.damage_dice}</span>}
          </summary>
          <p>{a.desc}</p>
        </details>
      ))}
    </>
  )
}

const SAVE_LABEL: Record<string, string> = {
  strength_save: '力量',
  dexterity_save: '敏捷',
  constitution_save: '体质',
  intelligence_save: '智力',
  wisdom_save: '感知',
  charisma_save: '魅力',
}

export function SheetPane({
  statblock,
  choices,
  loaded,
}: {
  statblock: E5Statblock
  choices: CharacterChoices
  loaded: LoadedEntities
}) {
  const [tab, setTab] = useState<'sheet' | 'json' | 'mianbuan'>('sheet')
  const [copied, setCopied] = useState(false)

  const json = JSON.stringify(statblock, null, 2)
  const mianbuanJson = JSON.stringify(toMianbuan(choices, loaded), null, 2)
  const activeJson = tab === 'mianbuan' ? mianbuanJson : json

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(activeJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  }

  function downloadJson() {
    if (tab === 'mianbuan') {
      download(mianbuanJson, mianbuanFileName(choices))
    } else {
      download(json, `${statblock.name || 'character'}.json`)
    }
  }

  /**
   * 在本站内嵌的面团角色卡里打开当前角色。
   * 数据经 localStorage 交接：面团页（public/sheet.html）初始化后读取并清除。
   * 弹窗被拦截时退回同标签页跳转，保证一定能打开。
   */
  function openInMianbuan() {
    try {
      localStorage.setItem('dnd5r-builder:handoff', mianbuanJson)
    } catch {
      alert('浏览器存储已满，无法交接数据。请改用「下载面团存档」再手动导入。')
      return
    }
    if (!window.open('./sheet.html', '_blank')) window.location.href = './sheet.html'
  }

  const saves = Object.entries(statblock.saving_throws).filter(([, v]) => v != null)
  const skills = Object.entries(statblock.skills ?? {}).filter(([, v]) => v != null)

  return (
    <aside className="sheet-pane">
      <div className="sheet-toolbar">
        <div className="tabs">
          <button className={tab === 'sheet' ? 'active' : ''} onClick={() => setTab('sheet')}>
            角色卡预览
          </button>
          <button className={tab === 'json' ? 'active' : ''} onClick={() => setTab('json')}>
            JSON
          </button>
          <button
            className={tab === 'mianbuan' ? 'active' : ''}
            onClick={() => setTab('mianbuan')}
            title="导出为「DND面团角色卡」可直接导入的存档"
          >
            面团角色卡
          </button>
        </div>
        <div className="toolbar-actions">
          <button className="btn small primary" onClick={openInMianbuan} title="在本站的面团角色卡中打开，数据自动填入">
            🎴 在面团角色卡中打开
          </button>
          <button className="btn small" onClick={copyJson}>
            {copied ? '✓ 已复制' : '复制 JSON'}
          </button>
          <button className="btn small" onClick={downloadJson}>
            {tab === 'mianbuan' ? '下载面团存档' : '下载 JSON'}
          </button>
        </div>
      </div>

      {tab === 'mianbuan' ? (
        <>
          <p className="meta mianbuan-hint">
            点上方「🎴 在面团角色卡中打开」即可直接出卡（数据自动填入）；
            也可下载此文件，在任意面团角色卡里点「导入」使用。
            属性/豁免/技能/攻击/特性/法术位均已算好，面团那边可继续手动改写。
          </p>
          <pre className="json-view">{mianbuanJson}</pre>
        </>
      ) : tab === 'json' ? (
        <pre className="json-view">{json}</pre>
      ) : (
        <div className="statblock">
          <h2 className="sheet-name">{statblock.name}</h2>
          <p className="sheet-meta">
            {statblock.size} {statblock.type}
            {statblock.subtype ? `（${statblock.subtype}）` : ''}
            {statblock.group ? ` · ${statblock.group}` : ''}
            {statblock.alignment ? ` · ${statblock.alignment}` : ''}
          </p>
          <div className="taper" />
          <p>
            <b>护甲等级</b> {statblock.armor_class.value}
            {statblock.armor_class.special ? `（${statblock.armor_class.special}）` : ''}
          </p>
          <p>
            <b>生命值</b> {statblock.hp.value}
            {statblock.hp.hit_dice ? `（生命骰 ${statblock.hp.hit_dice}）` : ''}
          </p>
          <p><b>速度</b> {statblock.speed.walk ?? 30} 尺</p>
          <div className="taper" />

          <div className="stat-row">
            <StatCell label="力量" value={statblock.stats.strength} />
            <StatCell label="敏捷" value={statblock.stats.dexterity} />
            <StatCell label="体质" value={statblock.stats.constitution} />
            <StatCell label="智力" value={statblock.stats.intelligence} />
            <StatCell label="感知" value={statblock.stats.wisdom} />
            <StatCell label="魅力" value={statblock.stats.charisma} />
          </div>
          <div className="taper" />

          {saves.length > 0 && (
            <p>
              <b>豁免</b>{' '}
              {saves.map(([k, v]) => `${SAVE_LABEL[k]} ${fmtMod(v as number)}`).join('，')}
            </p>
          )}
          {skills.length > 0 && (
            <p>
              <b>技能</b>{' '}
              {skills
                .map(([k, v]) => `${SKILL_CN[k as SkillKey] ?? k} ${fmtMod(v as number)}`)
                .join('，')}
            </p>
          )}
          {statblock.senses && statblock.senses.length > 0 && (
            <p><b>感官</b> {statblock.senses.join('，')}</p>
          )}
          {statblock.languages && statblock.languages.length > 0 && (
            <p><b>语言</b> {statblock.languages.join('、')}</p>
          )}

          {statblock.spell_slots && statblock.spell_slots.length > 0 && (
            <p>
              <b>法术位</b>{' '}
              {statblock.spell_slots
                .map(s => `${s.level}环 ×${s.limit.uses}`)
                .join('，')}
              {statblock.spell_dc ? ` · 豁免DC ${statblock.spell_dc}` : ''}
              {statblock.spell_attack ? ` · 法术攻击 ${statblock.spell_attack}` : ''}
            </p>
          )}
          {statblock.spells && statblock.spells.length > 0 && (
            <p><b>法术</b> {statblock.spells.join('、')}</p>
          )}

          <ActionBlock title="动作" list={statblock.actions} />
          <ActionBlock title="特殊能力" list={statblock.special_abilities} />

          {statblock.items && statblock.items.length > 0 && (
            <>
              <h3 className="sheet-section">物品</h3>
              <ul className="item-list">
                {statblock.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </>
          )}

          {statblock.source && <p className="sheet-source">{statblock.source}</p>}
        </div>
      )}
    </aside>
  )
}
