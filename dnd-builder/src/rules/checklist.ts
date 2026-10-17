// 完成度清单：把「还没选的」(todo) 与「选了但不合规」(warn) 汇总到一处。
// 只读取统一推导结果与已有规则函数，不新增规则。

import { SKILL_CN } from '../data/mappings'
import { allFeatSlots, pendingBonuses } from './build'
import { featPrereqUnmet, type DerivedCharacter } from './character'
import {
  multiclassProfs, prereqLabel, prereqOf, spellPreparable, spellQuotas, subclassLevel, unmetPrereq,
} from './multiclass'
import { toolOptions, validPicks } from './skills'

export interface CheckItem {
  level: 'todo' | 'warn'
  text: string
}

export function checklist(d: DerivedCharacter): CheckItem[] {
  const { c, loaded } = d
  const out: CheckItem[] = []
  const todo = (text: string) => out.push({ level: 'todo', text })
  const warn = (text: string) => out.push({ level: 'warn', text })

  // ---- 基础 ----
  if (!c.name.trim()) todo('填写角色名')
  if (!c.classUrl) todo('选择职业')
  if (!c.speciesUrl) todo('选择种族')
  if (!c.backgroundUrl) todo('选择背景')
  if (Object.values(c.baseScores).some(v => v == null)) todo('分配全部六项属性值')

  // ---- 职业 ----
  for (const inst of d.instances) {
    if (!inst.subclass && inst.level >= subclassLevel(inst.cls)) todo(`选择${inst.cls.nameCn}子职`)
  }
  const cls = loaded.cls
  if (cls && c.classSkills.length < cls.skillChoiceCount) {
    todo(`职业技能熟练还差 ${cls.skillChoiceCount - c.classSkills.length} 项`)
  }
  if (d.multiclassed) {
    for (const inst of d.instances) {
      const unmet = unmetPrereq(prereqOf(inst.cls), d.abilities.total)
      if (unmet.length) warn(`${inst.cls.nameCn}兼职先决不满足（${prereqLabel(prereqOf(inst.cls))}）`)
    }
    for (const m of c.multiclasses ?? []) {
      const mcCls = loaded.multiclasses[m.classUrl]?.cls
      if (mcCls && !m.skill && multiclassProfs(mcCls).skillChoices) todo(`${mcCls.nameCn}兼职的技能熟练未选`)
    }
  }

  // ---- 属性加值与专长 ----
  const unassigned = pendingBonuses(c, loaded).filter(p => !c.abilityPicks[p.key])
  if (unassigned.length) todo(`属性加值还有 ${unassigned.length} 处未分配（${[...new Set(unassigned.map(p => p.source))].join('、')}）`)
  for (const slot of allFeatSlots(c, loaded)) {
    const f = c.feats[slot.key]
    if (!f) todo(`专长槽位「${slot.label}」未选`)
    else {
      const unmet = featPrereqUnmet(f.desc, d)
      if (unmet.length) warn(`专长「${f.name}」先决不满足：${unmet.join('，')}`)
    }
  }

  // ---- 技能、语言、工具 ----
  for (const ch of d.skillChoices) {
    const n = validPicks(ch, c.skillPicks).length
    if (n < ch.count) todo(`${ch.source}：自选技能还差 ${ch.count - n} 项`)
  }
  for (const src of d.expertiseSources) {
    const ok = d.expertiseBySource[src.key] ?? []
    if (ok.length < src.count) todo(`${src.source}：专精还差 ${src.count - ok.length} 项`)
    // 熟练被撤销、或与别处专精重复后，原先的选择不再生效
    const lost = (c.expertisePicks?.[src.key] ?? []).filter(s => !ok.includes(s))
    if (lost.length) warn(`${src.source}：专精选择已失效（${lost.map(s => SKILL_CN[s]).join('、')}）`)
  }
  if (d.masteryIds.length < d.masteryCount) todo(`武器精通还差 ${d.masteryCount - d.masteryIds.length} 项`)
  const freeLangs = d.languages.filter(l => l !== '通用语' && !d.grantedLanguages.includes(l)).length
  if (freeLangs < d.languagePicks) todo(`自选语言还差 ${d.languagePicks - freeLangs} 种`)
  const toolOpts = loaded.background ? toolOptions(loaded.background.tool) : null
  if (toolOpts && !toolOpts.includes(c.toolChoice)) todo(`背景工具：${loaded.background!.tool}`)

  // ---- 装备 ----
  for (const note of d.armorNotes) if (/^未受训|^力量低于/.test(note)) warn(note)
  for (const w of d.weapons) if (!w.proficient) warn(`未熟练武器：${w.def.nameCn}`)

  // ---- 法术 ----
  const q = spellQuotas(d.instances)
  const all = loaded.spellList?.all ?? loaded.spellList?.spells ?? []
  const ring = (n: string) => all.find(s => s.name === n)?.ring
  const cantrips = c.spells.filter(n => ring(n) === 0).length
  const leveled = c.spells.length - cantrips
  if (q.cantrips != null && cantrips < q.cantrips) todo(`戏法还差 ${q.cantrips - cantrips} 个`)
  if (q.prepared != null && leveled < q.prepared) todo(`准备法术还差 ${q.prepared - leveled} 个`)
  for (const ch of d.featSpellChoices) {
    const need = ch.groups.reduce((n, g) => n + g.count, 0)
    const got = d.featSpellPicks[ch.key]?.length ?? 0
    if (got < need) todo(`${ch.source}：自选法术还差 ${need - got} 个`)
  }
  const over = c.spells.filter(n => {
    const sp = all.find(s => s.name === n)
    return sp && !spellPreparable(sp, d.instances)
  })
  if (over.length) warn(`超出可准备环阶的法术：${over.join('、')}`)

  return out
}
