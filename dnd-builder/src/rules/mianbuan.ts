// 导出为「DND面团角色卡」(v4.1) 的存档格式。
// 该格式是一份可直接被面团角色卡 HTML 导入的完整 state：
//   page1 = 属性/豁免/技能/攻击/特性，page2 = 施法/法术/背景故事/财物。
// 每个派生值都带 { value, overridden } —— 我们只填 value 并保持 overridden:false，
// 让面团那边继续自动计算；用户在面团里手动改写时才会置为 true。

import type { AbilityKey, CharacterChoices, LoadedEntities, SkillKey } from '../types'
import { SKILL_ABILITY } from '../data/mappings'
import { deriveCharacter } from './character'
import { hitDiceLabel } from './multiclass'
import { fmtMod } from './rules'

/** 我方 SkillKey -> 面团技能键（snake_case -> camelCase） */
const SKILL_TO_MIANBUAN: Record<SkillKey, string> = {
  athletics: 'athletics',
  acrobatics: 'acrobatics',
  sleight_of_hand: 'sleightOfHand',
  stealth: 'stealth',
  arcana: 'arcana',
  history: 'history',
  investigation: 'investigation',
  nature: 'nature',
  religion: 'religion',
  animal_handling: 'animalHandling',
  insight: 'insight',
  medicine: 'medicine',
  perception: 'perception',
  survival: 'survival',
  deception: 'deception',
  intimidation: 'intimidation',
  performance: 'performance',
  persuasion: 'persuasion',
}

const MIANBUAN_ABILITY: Record<AbilityKey, string> = {
  STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha',
}

interface Derived { value: number | null; overridden: boolean }
interface ProfDerived extends Derived { prof: number }

export interface MianbuanState {
  meta: { version: string; savedAt: string; generator?: string }
  page1: Record<string, unknown>
  page2: Record<string, unknown>
}

const derived = (value: number | null): Derived => ({ value, overridden: false })
const profDerived = (prof: number, value: number | null): ProfDerived => ({
  prof, value, overridden: false,
})

// 面团用 id 做条目增删的主键；同一毫秒内生成多个块会撞号，这里用全局递增计数器兜底
let _idSeq = 0
const nextId = () => Date.now() * 1000 + (_idSeq++ % 1000)

/** 结构化条目块（面团的 mode:"structured" 列表区） */
function structuredBlock(items: { name: string; level?: string; detail: string }[]) {
  return {
    mode: items.length > 0 ? 'structured' : 'free',
    freeText: '',
    freeTextFontSize: 9,
    structuredList: items.map(it => ({
      id: nextId(),
      name: it.name,
      level: it.level ?? '',
      detail: it.detail,
    })),
  }
}

export function toMianbuan(c: CharacterChoices, loaded: LoadedEntities): MianbuanState {
  const d = deriveCharacter(c, loaded)
  const { abilities: ab, pb, instances: inst } = d
  const species = loaded.species
  const bg = loaded.background
  const saveSet = new Set<AbilityKey>(d.saves)

  // ---- 属性 / 调整值 / 豁免 / 技能 ----
  const stats: Record<string, number> = {}
  const modifiers: Record<string, Derived> = {}
  const savingThrows: Record<string, ProfDerived> = {}
  for (const k of Object.keys(MIANBUAN_ABILITY) as AbilityKey[]) {
    const key = MIANBUAN_ABILITY[k]
    stats[key] = ab.total[k]
    modifiers[key] = derived(ab.mods[k])
    const isProf = saveSet.has(k)
    savingThrows[key] = profDerived(isProf ? 1 : 0, ab.mods[k] + (isProf ? pb : 0))
  }
  const skills: Record<string, ProfDerived> = {}
  for (const [sk, mb] of Object.entries(SKILL_TO_MIANBUAN) as [SkillKey, string][]) {
    const prof = d.expertise.includes(sk) ? 2 : d.profSkills.has(sk) ? 1 : 0
    // 面团按 调整值 + prof×熟练加值 自动计算；万事通的半熟练它算不出来，标记为手动覆盖
    const auto = ab.mods[SKILL_ABILITY[sk]] + prof * pb
    skills[mb] = { prof, value: d.skillBonus[sk], overridden: d.skillBonus[sk] !== auto }
  }

  // ---- 武器攻击（面团固定 6 行） ----
  const weapons = Array.from({ length: 6 }, () => ({ name: '', bonus: '', damage: '', note: '' }))
  d.weapons.slice(0, 6).forEach(({ def: w, damageBonus, attackBonus, mastery, proficient }, i) => {
    weapons[i] = {
      name: `${w.nameCn} ${w.nameEn}`.trim(),
      bonus: fmtMod(attackBonus),
      damage: `${w.dice}${damageBonus !== 0 ? fmtMod(damageBonus) : ''} ${w.damageType}`,
      note: [
        w.ranged ? `射程${w.range}` : w.reach ? '触及10尺' : '近战',
        w.versatile ? `多用${w.versatile}` : '',
        w.thrown && !w.ranged ? `可投掷${w.range}` : '',
        mastery ? `精通：${mastery}` : '',
        proficient ? '' : '未熟练',
      ].filter(Boolean).join('，'),
    }
  })

  // ---- 职业特性 / 子职特性（兼职时等级标签带职业名） ----
  const classItems: { name: string; level?: string; detail: string }[] = []
  for (const g of d.classFeatures) {
    const tag = d.multiclassed ? g.inst.cls.nameCn : ''
    for (const [lv, names] of g.byLevel) {
      classItems.push({ name: names.join('、'), level: `${tag}${lv}级`, detail: '' })
    }
    for (const { level, feature } of g.subclassFeatures) {
      classItems.push({
        name: `${g.inst.subclass!.nameCn}：${feature.name.replace(/^\d+\s*级\s*[：:]/, '')}`,
        level: `${tag}${level}级`,
        detail: feature.desc,
      })
    }
  }

  // 职业资源与数值：面团没有专门的资源栏，作为职业特性条目列出
  for (const l of d.resources.limits) {
    classItems.push({
      name: `${l.name} ×${l.uses}`,
      level: '资源',
      detail: [`恢复：${(l.resets ?? []).join('、')}`, l.description].filter(Boolean).join('；'),
    })
  }
  for (const v of d.resources.values) {
    classItems.push({ name: `${v.name}：${v.value}`, level: d.multiclassed ? v.className : '数值', detail: '' })
  }

  // ---- 施法 / 法术位：面团只有一个施法属性栏，取第一个施法职业的 ----
  const spellAb = d.casters[0]?.ability ?? null
  const spellMod = spellAb ? ab.mods[spellAb] : null
  const DIAMOND_COUNT: Record<string, number> = {
    '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 2, '8': 1, '9': 1,
  }
  const spellSlots: Record<string, { total: number; diamonds: boolean[] }> = {}
  for (const ring of Object.keys(DIAMOND_COUNT)) {
    spellSlots[ring] = {
      total: d.slots.slots[parseInt(ring, 10)] ?? 0,
      diamonds: Array.from({ length: DIAMOND_COUNT[ring] }, () => false),
    }
  }
  // 魔契法术位并入对应环阶
  if (d.slots.pact) {
    const key = String(d.slots.pact.level)
    if (spellSlots[key]) spellSlots[key].total += d.slots.pact.count
  }
  const spells = {
    mode: d.spells.length > 0 ? 'structured' : 'free',
    freeText: '',
    freeTextFontSize: 9,
    // 手动补充的法术查不到元数据，按 0 环导出，由使用者在面团里改
    structuredList: d.spells.map(({ name, entry, source }) => ({
      id: nextId(),
      level: entry?.ring ?? 0,
      prepared: false,
      name,
      school: entry?.school ?? '',
      castingTime: entry?.castingTime ?? '', range: '',
      components: entry?.components ?? '', duration: '',
      concentration: entry?.concentration ?? false,
      ritual: entry?.ritual ?? false,
      material: (entry?.components ?? '').includes('M'),
      note: source || (entry?.source ? `来源：${entry.source}` : ''),
      description: '', higherLevel: '',
      fromDatabase: false, databaseId: null,
    })),
  }

  const equipment = [...d.equipment]
  if (d.armor.id !== 'none') equipment.push(`${d.armor.nameCn} ${d.armor.nameEn}`)
  if (c.shield) equipment.push('盾牌 Shield')

  return {
    meta: {
      version: '4.1',
      savedAt: new Date().toISOString(),
      generator: 'DND 5R 自动车卡',
    },
    page1: {
      charName: c.name || '未命名角色',
      background: bg?.nameCn ?? '',
      charClass: inst.map(i => `${i.cls.nameCn} ${i.level}级`).join(' '),
      race: species ? species.nameCn + (d.subraceName ? `（${d.subraceName}）` : '') : '',
      subclass: inst.map(i => i.subclass?.nameCn).filter(Boolean).join(' / '),
      level: String(d.level),
      exp: '',
      portraitData: '',
      armorClass: String(d.ac),
      shield: c.shield ? '是' : '',
      hp: { temp: 0, consumed: 0, max: d.hp.max, currentOverridden: false, currentVal: d.hp.max },
      hitDice: inst.length ? hitDiceLabel(inst) : '',
      hitDiceTotal: inst.length ? String(d.level) : '',
      speed: String(d.speed),
      size: d.sizeCn,
      deathSaves: { success: [false, false, false], fail: [false, false, false] },
      proficiencyBonus: pb,
      heroicInspiration: false,
      stats,
      savingThrows,
      modifiers,
      skills,
      initiative: { value: d.initiative, overridden: d.initiative !== ab.mods.DEX },
      passivePerception: derived(d.passivePerception),
      weapons,
      classFeatures: structuredBlock(classItems),
      racialTraits: structuredBlock(d.spTraits.map(t => ({ name: t.name, detail: t.desc }))),
      feats: structuredBlock(d.feats.map(f => ({ name: f.name, level: f.tag, detail: f.desc }))),
      armorProf: {
        light: d.profs.light,
        medium: d.profs.medium,
        heavy: d.profs.heavy,
        shield: d.profs.shield,
      },
      weaponProficiencies: d.profs.weapons,
      toolProficiencies: d.tools,
    },
    page2: {
      // 面团的施法属性下拉用短键（str/dex/con/int/wis/cha），不是全称
      spellcastingAbility: spellAb ? MIANBUAN_ABILITY[spellAb] : '',
      spellAbilityMod: derived(spellMod),
      spellSaveDC: derived(spellMod == null ? null : 8 + pb + spellMod),
      spellAttackBonus: derived(spellMod == null ? null : pb + spellMod),
      spellSlots,
      spells,
      appearance: '',
      backstory: c.about ?? '',
      alignment: c.alignment ?? '',
      languages: d.languages.join('、'),
      equipment: equipment.join('\n'),
      attunement: [false, false, false],
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    },
  }
}

/** 面团导出文件名与其自身导出保持一致 */
export function mianbuanFileName(c: CharacterChoices): string {
  return `${c.name || '未命名角色'}_DND5E角色卡.json`
}

// ponytail: 仅做「本工具 -> 面团」单向导出；反向导入需要把自由文本再解析回
// 结构化选择（职业/子职/种族的 url），代价远大于收益，等真有需求再说。
