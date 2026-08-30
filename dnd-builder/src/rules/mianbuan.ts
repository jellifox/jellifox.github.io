// 导出为「DND面团角色卡」(v4.1) 的存档格式。
// 该格式是一份可直接被面团角色卡 HTML 导入的完整 state：
//   page1 = 属性/豁免/技能/攻击/特性，page2 = 施法/法术/背景故事/财物。
// 每个派生值都带 { value, overridden } —— 我们只填 value 并保持 overridden:false，
// 让面团那边继续自动计算；用户在面团里手动改写时才会置为 true。

import type {
  AbilityKey, CharacterChoices, LoadedEntities, SkillKey,
} from '../types'
import { SKILL_ABILITY, cnToSkill } from '../data/mappings'
import {
  deriveAbilities, deriveHp, effectiveSubrace, featSlots, gainedFeatures, speciesTraits,
} from './build'
import { grantedSpells } from './spells'
import {
  ARMORS, WEAPONS, abilityMod, armorClassValue, fmtMod,
  proficiencyBonus, weaponAttackAbility,
} from './rules'
import { subclassFeatureLevel } from '../data/parsers'

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
  const cls = loaded.cls ?? undefined
  const sub = loaded.subclass ?? undefined
  const species = loaded.species ?? undefined
  const bg = loaded.background ?? undefined

  const ab = deriveAbilities(c, loaded.background, species)
  const pb = proficiencyBonus(c.level)
  const level = c.level

  // ---- 生命值 / 护甲（与角色卡预览共用 deriveHp / speciesTraits） ----
  const subraceName = effectiveSubrace(species, c.subraceChoice)
  const spTraits = speciesTraits(species, c.subraceChoice)
  const hpInfo = deriveHp(c, cls, spTraits, ab.mods.CON)
  const hitDie = hpInfo.hitDie
  const hpMax = hpInfo.max

  const armor = ARMORS.find(a => a.id === c.armorId) ?? ARMORS[0]
  const acValue = armorClassValue(armor, ab.mods.DEX, c.shield)

  // ---- 熟练技能（背景 + 职业选择 + 种族特质授予） ----
  const profSkills = new Set<SkillKey>([...(bg?.skills ?? []), ...c.classSkills])
  for (const t of spTraits) {
    const m = t.desc.match(/拥有(?:对)?([^\n。，]{1,6})技能的熟练|获得([^\n。，]{1,6})技能熟练/)
    if (m) {
      const sk = cnToSkill((m[1] ?? m[2]).trim())
      if (sk) profSkills.add(sk)
    }
  }

  const saveSet = new Set<AbilityKey>(cls?.saves ?? [])

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
    const isProf = profSkills.has(sk)
    skills[mb] = profDerived(isProf ? 1 : 0, ab.mods[SKILL_ABILITY[sk]] + (isProf ? pb : 0))
  }

  // ---- 武器攻击（面团固定 6 行） ----
  const weapons = Array.from({ length: 6 }, () => ({ name: '', bonus: '', damage: '', note: '' }))
  c.weaponIds.slice(0, 6).forEach((wid, i) => {
    const w = WEAPONS.find(x => x.id === wid)
    if (!w) return
    const atkAb = weaponAttackAbility(w, ab.mods.STR, ab.mods.DEX)
    const atkMod = ab.mods[atkAb]
    weapons[i] = {
      name: `${w.nameCn} ${w.nameEn}`.trim(),
      bonus: fmtMod(atkMod + pb),
      damage: `${w.dice}${atkMod !== 0 ? fmtMod(atkMod) : ''} ${w.damageType}`,
      note: [
        w.ranged ? `射程${w.range}` : '近战',
        w.versatile ? `多用${w.versatile}` : '',
        w.thrown && !w.ranged ? `可投掷${w.range}` : '',
      ].filter(Boolean).join('，'),
    }
  })

  // ---- 职业特性 / 子职特性 ----
  const classItems: { name: string; level?: string; detail: string }[] = []
  const byLevel = new Map<number, string[]>()
  for (const f of gainedFeatures(cls, level)) {
    byLevel.set(f.level, [...(byLevel.get(f.level) ?? []), f.name])
  }
  for (const [lv, names] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    classItems.push({ name: names.join('、'), level: `${lv}级`, detail: '' })
  }
  for (const f of sub?.features ?? []) {
    if (subclassFeatureLevel(f.name) <= level) {
      classItems.push({
        name: `${sub!.nameCn}：${f.name.replace(/^\d+\s*级\s*[：:]/, '')}`,
        level: `${subclassFeatureLevel(f.name)}级`,
        detail: f.desc,
      })
    }
  }

  // ---- 种族特质 ----
  const raceItems = spTraits.map(t => ({ name: t.name, detail: t.desc }))

  // ---- 专长（起源 + 各升级槽位） ----
  const featItems: { name: string; level?: string; detail: string }[] = []
  const origin = c.feats['origin']
  if (origin) featItems.push({ name: origin.name, level: '起源', detail: origin.desc })
  else if (bg?.feat) featItems.push({ name: bg.feat, level: '起源', detail: `来自背景「${bg.nameCn}」。` })
  for (const slot of featSlots(cls ?? null, level)) {
    const f = c.feats[slot.key]
    if (!f) continue
    const lv =
      slot.kind === 'style' ? '战斗风格' :
      slot.kind === 'epic' ? '传奇恩惠' :
      `${slot.key.replace(/^lv/, '').replace(/epic$/, '')}级`
    featItems.push({ name: f.name, level: lv, detail: f.desc })
  }

  // ---- 施法 / 法术位 ----
  const row = cls?.levels.find(r => r.level === level)
  const spellAb = cls?.spellAbility ?? null
  const spellMod = spellAb ? ab.mods[spellAb] : null

  const DIAMOND_COUNT: Record<string, number> = {
    '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 2, '8': 1, '9': 1,
  }
  const spellSlots: Record<string, { total: number; diamonds: boolean[] }> = {}
  for (const ring of Object.keys(DIAMOND_COUNT)) {
    const total = row?.slots?.[parseInt(ring, 10) as unknown as number] ?? 0
    spellSlots[ring] = {
      total,
      diamonds: Array.from({ length: DIAMOND_COUNT[ring] }, () => false),
    }
  }
  // 魔契法术位并入对应环阶
  if (row?.pactSlots && row.pactSlots.count > 0) {
    const key = String(row.pactSlots.level)
    if (spellSlots[key]) spellSlots[key].total += row.pactSlots.count
  }

  // 从法术速查回查环阶与学派——否则导出的法术在面团里全部变成 0 环、无学派
  // 用未过滤的全表查元数据：特性赋予的法术常不在本职业列表内（如森林侏儒的动物交谈）
  const byName = new Map(
    (loaded.spellList?.all ?? loaded.spellList?.spells ?? []).map(s => [s.name, s])
  )
  // 特性赋予的法术一并导出，并在备注里标明来源
  const grants = grantedSpells(c, loaded)
  const spellItems = [
    ...c.spells.map(name => ({ name, entry: byName.get(name), note: '' })),
    ...grants
      .filter(g => !c.spells.includes(g.name))
      .map(g => ({ name: g.name, entry: byName.get(g.name), note: g.source })),
    // 手动补充的法术查不到元数据，按 0 环导出，由使用者在面团里改
    ...c.spellsText.split('\n').map(s => s.trim()).filter(Boolean)
      .map(name => ({ name, entry: undefined, note: '' })),
  ]
  const spells = {
    mode: spellItems.length > 0 ? 'structured' : 'free',
    freeText: '',
    freeTextFontSize: 9,
    structuredList: spellItems.map(({ name, entry, note }) => ({
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
      note: note || (entry?.source ? `来源：${entry.source}` : ''),
      description: '', higherLevel: '',
      fromDatabase: false, databaseId: null,
    })),
  }

  // ---- 装备清单 ----
  const equipment: string[] = []
  if (cls && cls.equipmentOptions[c.classEquipChoice]) {
    equipment.push(`职业装备：${cls.equipmentOptions[c.classEquipChoice]}`)
  }
  if (bg && bg.equipmentOptions[c.bgEquipChoice]) {
    equipment.push(`背景装备：${bg.equipmentOptions[c.bgEquipChoice]}`)
  }
  if (armor.id !== 'none') equipment.push(`${armor.nameCn} ${armor.nameEn}`)
  if (c.shield) equipment.push('盾牌 Shield')

  const sizeCn = c.sizeChoice || species?.sizeOptions[0] || '中型'

  return {
    meta: {
      version: '4.1',
      savedAt: new Date().toISOString(),
      generator: 'DND 5R 自动车卡',
    },
    page1: {
      charName: c.name || '未命名角色',
      background: bg?.nameCn ?? '',
      charClass: cls ? `${cls.nameCn}${level ? ` ${level}级` : ''}` : '',
      race: species ? species.nameCn + (subraceName ? `（${subraceName}）` : '') : '',
      subclass: sub?.nameCn ?? '',
      level: String(level),
      exp: '',
      portraitData: '',
      armorClass: String(acValue),
      shield: c.shield ? '是' : '',
      hp: {
        temp: 0,
        consumed: 0,
        max: hpMax,
        currentOverridden: false,
        currentVal: hpMax,
      },
      hitDice: cls ? `d${hitDie}` : '',
      hitDiceTotal: cls ? String(level) : '',
      speed: String(species?.speed || 30),
      size: sizeCn,
      deathSaves: { success: [false, false, false], fail: [false, false, false] },
      proficiencyBonus: pb,
      heroicInspiration: false,
      stats,
      savingThrows,
      modifiers,
      skills,
      initiative: derived(ab.mods.DEX),
      passivePerception: derived(
        10 + ab.mods.WIS + (profSkills.has('perception') ? pb : 0)
      ),
      weapons,
      classFeatures: structuredBlock(classItems),
      racialTraits: structuredBlock(raceItems),
      feats: structuredBlock(featItems),
      armorProf: {
        light: /轻甲/.test(cls?.armorTraining ?? ''),
        medium: /中甲/.test(cls?.armorTraining ?? ''),
        heavy: /重甲/.test(cls?.armorTraining ?? ''),
        shield: /盾牌/.test(cls?.armorTraining ?? ''),
      },
      weaponProficiencies: cls?.weaponProf ?? '',
      toolProficiencies: bg?.tool ?? '',
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
      languages: c.languages.join('、'),
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

/** 自检：核心字段齐全、技能键与面团一致（浏览器控制台可手动调用） */
export function selfCheck(c: CharacterChoices, loaded: LoadedEntities): string[] {
  const s = toMianbuan(c, loaded)
  const errs: string[] = []
  const p1 = s.page1 as Record<string, Record<string, unknown>>
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
    if (typeof (p1.stats as Record<string, number>)[k] !== 'number') errs.push(`stats.${k} 缺失`)
    if (!(k in (p1.savingThrows as object))) errs.push(`savingThrows.${k} 缺失`)
  }
  for (const mb of Object.values(SKILL_TO_MIANBUAN)) {
    if (!(mb in (p1.skills as object))) errs.push(`skills.${mb} 缺失`)
  }
  if (Array.isArray(p1.weapons) && (p1.weapons as unknown[]).length !== 6) {
    errs.push('weapons 必须是 6 行')
  }
  return errs
}
