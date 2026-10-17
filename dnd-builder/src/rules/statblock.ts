// 把统一推导模型序列化为 E5StatblockIn 角色卡。规则计算全部在 character.ts。

import type {
  Action, CharacterChoices, E5Statblock, LoadedEntities, RepoMeta, Skills, SpellSlots,
} from '../types'
import { ABILITY_CN, ABILITY_FULL_EN, SIZE_CN_TO_EN, SKILL_ABILITY } from '../data/mappings'
import { deriveCharacter } from './character'
import { classSummary, hitDiceLabel } from './multiclass'
import { fmtMod } from './rules'

export function buildStatblock(
  c: CharacterChoices,
  meta: RepoMeta | null,
  loaded: LoadedEntities
): E5Statblock {
  const d = deriveCharacter(c, loaded)
  const { abilities: ab, pb, instances: inst } = d
  const species = loaded.species
  const bg = loaded.background

  const savingThrows: E5Statblock['saving_throws'] = {}
  for (const k of d.saves) {
    savingThrows[`${ABILITY_FULL_EN[k]}_save` as keyof typeof savingThrows] = ab.mods[k] + pb
  }

  const skills: Skills = {}
  for (const s of d.profSkills) skills[s] = ab.mods[SKILL_ABILITY[s]] + pb

  // 感官：种族特质里的黑暗视觉
  const senses: string[] = []
  for (const t of d.spTraits) {
    const m = (t.name + t.desc).match(/(\d+)\s*尺.{0,4}黑暗视觉|黑暗视觉.{0,8}?(\d+)\s*尺/)
    if (/黑暗视觉/.test(t.name) && m) senses.push(`黑暗视觉 ${m[1] ?? m[2]}尺`)
  }
  senses.push(`被动察觉 ${d.passivePerception}`)

  // 特殊能力：种族特质 + 专长 + 职业特性 + 子职特性
  const specials: Action[] = d.spTraits.map(t => ({ name: `【种族】${t.name}`, desc: t.desc }))
  for (const f of d.feats) {
    const tag = f.kind === 'origin' ? '起源专长' : f.kind === 'general' ? `${f.tag}专长` : f.tag
    specials.push({ name: `【${tag}】${f.name}`, desc: f.desc })
  }
  for (const g of d.classFeatures) {
    if (g.byLevel.length) {
      specials.push({
        name: `【职业特性】${g.inst.cls.nameCn}${d.multiclassed ? ` ${g.inst.level}级` : ''}`,
        desc: g.byLevel.map(([lv, names]) => `${lv}级：${names.join('、')}`).join('\n'),
      })
    }
    for (const { feature } of g.subclassFeatures) {
      specials.push({ name: `【子职·${g.inst.subclass!.nameCn}】${feature.name}`, desc: feature.desc })
    }
  }

  const actions: Action[] = d.weapons.map(({ def: w, ability, mod, attackBonus }) => {
    const parts = [w.ranged ? `远程攻击：射程${w.range}` : '近战攻击：触及5尺']
    if (w.thrown && !w.ranged) parts.push(`可投掷(${w.range})`)
    if (w.versatile) parts.push(`双手持用时伤害为${w.versatile}`)
    parts.push(`${w.damageType}伤害`)
    return {
      name: `${w.nameCn} ${w.nameEn}`,
      desc: parts.join('，') + '。',
      attack_bonus: attackBonus,
      stat_bonus: [ability],
      damage_dice: `${w.dice}${mod !== 0 ? fmtMod(mod) : ''}`,
    }
  })

  const spellSlots: SpellSlots[] = Object.entries(d.slots.slots).map(([lv, count]) => ({
    level: parseInt(lv, 10),
    limit: { name: `${lv}环法术位`, uses: count as number, resets: ['长休'] },
  }))
  if (d.slots.pact) {
    spellSlots.push({
      level: d.slots.pact.level,
      limit: { name: '魔契法术位', uses: d.slots.pact.count, resets: ['短休', '长休'] },
    })
  }
  // 法术 DC / 攻击：每个施法职业用各自的施法属性，相同的合并显示
  const uniq = (xs: string[]) => xs.filter((v, i, a) => a.indexOf(v) === i)
  const hasMagic = d.casters.length > 0 && spellSlots.length > 0
  const spellDc = hasMagic
    ? uniq(d.casters.map(({ inst: i, ability }) =>
        `${8 + pb + ab.mods[ability]}（${ABILITY_CN[ability]}${d.casters.length > 1 ? '·' + i.cls.nameCn : ''}）`)).join(' / ')
    : null
  const spellAttack = hasMagic
    ? uniq(d.casters.map(({ ability }) => fmtMod(pb + ab.mods[ability]))).join(' / ')
    : null

  const items = [...d.equipment]
  if (bg?.tool) items.push(`工具熟练：${bg.tool}`)
  for (const w of d.weapons) items.push(`${w.def.nameCn} ${w.def.nameEn}`)
  if (d.armor.id !== 'none') items.push(`${d.armor.nameCn} ${d.armor.nameEn}`)
  if (c.shield) items.push('盾牌 Shield')

  const aboutParts: string[] = []
  if (species) aboutParts.push(`种族：${species.nameCn} ${species.nameEn}`)
  if (inst.length) {
    aboutParts.push(`职业：${inst.map(i => `${i.cls.nameCn} ${i.level}级${i.subclass ? `（${i.subclass.nameCn}）` : ''}`).join(' / ')}`)
  }
  if (bg) aboutParts.push(`背景：${bg.nameCn} ${bg.nameEn}`)
  if (c.about.trim()) aboutParts.push(c.about.trim())

  const acSpecial = [
    d.armor.id === 'none' ? null : `${d.armor.nameCn} ${d.armor.nameEn}`,
    c.shield ? '盾牌' : null,
  ].filter(Boolean).join('，') || null

  return {
    name: c.name || '未命名冒险者',
    about: aboutParts.join('；') || null,
    size: SIZE_CN_TO_EN[d.sizeCn] ?? 'Medium',
    type: 'humanoid',
    subtype: species ? `${species.nameCn} ${species.nameEn}`.trim() : null,
    group: inst.length ? classSummary(inst) : null,
    alignment: c.alignment,
    armor_class: { value: d.ac, special: acSpecial },
    hp: { value: d.hp.max, hit_dice: inst.length ? hitDiceLabel(inst) : null },
    speed: { walk: d.speed },
    stats: {
      strength: ab.total.STR,
      dexterity: ab.total.DEX,
      constitution: ab.total.CON,
      intelligence: ab.total.INT,
      wisdom: ab.total.WIS,
      charisma: ab.total.CHA,
    },
    saving_throws: savingThrows,
    perception: d.passivePerception,
    skills: Object.keys(skills).length ? skills : null,
    senses,
    languages: c.languages,
    items,
    actions,
    special_abilities: specials,
    spell_slots: spellSlots,
    spells: d.spells.filter(s => !s.source).map(s => s.name),
    spell_dc: spellDc,
    spell_attack: spellAttack,
    challenge_rating: null,
    cr: null,
    source: meta ? `5E不全书 ${meta.branch}@${meta.shortSha}（DND5eChm/DND5e_chm）` : null,
  }
}
