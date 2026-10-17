// 统一推导模型：把「用户选择 + 已加载的规则数据」一次性算成一个完整的角色。
//
// 角色卡预览（statblock.ts）与面团导出（mianbuan.ts）都只消费这里的结果、只负责序列化。
// 以前两边各自重算技能、特性、法术位，改一处漏一处；现在任何规则修正只改这一个地方。

import type {
  AbilityKey, CharacterChoices, LoadedEntities, SkillKey, SpellEntry, TraitEntry,
} from '../types'
import { RARE_LANGUAGES, SKILL_ABILITY, SKILL_KEYS, STANDARD_LANGUAGES, cnToSkill } from '../data/mappings'
import { subclassFeatureLevel } from '../data/parsers'
import {
  activeFeats, allFeatSlots, deriveAbilities, deriveHp, effectiveSubrace,
  gainedFeatures, speciesTraits, type DerivedAbilities,
} from './build'
import {
  classInstances, parsePrereq, proficiencySummary, spellAbilityOf, spellSlotsFor,
  type ClassInstance, type ProficiencySummary, type SlotResult,
} from './multiclass'
import {
  ARMORS, WEAPONS, armorClassValue, armorTrained, proficiencyBonus, weaponAttackAbility,
  weaponProficient, type ArmorDef, type WeaponDef,
} from './rules'
import { grantedSpells, type GrantedSpell } from './spells'
import {
  LANGUAGE_PICKS, expertiseSources, grantedLanguages, pickedSkills, skillChoices, toolOptions,
  type SkillChoice,
} from './skills'
import { classResources, type ClassResources } from './resources'

export interface FeatEntry {
  /** 'origin' 或升级槽位的类别 */
  kind: 'origin' | 'general' | 'style' | 'epic'
  /** 简短的来源标签：「起源」「4级」「术士4级」「战斗风格」「传奇恩惠」 */
  tag: string
  name: string
  desc: string
}

export interface ClassFeatureGroup {
  inst: ClassInstance
  /** 已获得的职业特性，按职业等级分组 */
  byLevel: [number, string[]][]
  /** 已获得的子职特性（按该职业自己的等级判定） */
  subclassFeatures: { level: number; feature: TraitEntry }[]
}

export interface WeaponAttack {
  def: WeaponDef
  ability: AbilityKey
  mod: number
  attackBonus: number
  /** 伤害加值（属性 + 战斗风格） */
  damageBonus: number
  proficient: boolean
  /** 已选用的精通词条 */
  mastery: string | null
  /** 战斗风格等附注 */
  notes: string[]
}

export interface SpellPick {
  name: string
  entry: SpellEntry | undefined
  /** 特性赋予的法术写来源，自选的为空 */
  source: string
}

export interface DerivedCharacter {
  c: CharacterChoices
  loaded: LoadedEntities
  instances: ClassInstance[]
  multiclassed: boolean
  level: number
  pb: number
  abilities: DerivedAbilities
  spTraits: TraitEntry[]
  subraceName: string
  hp: ReturnType<typeof deriveHp>
  armor: ArmorDef
  ac: number
  /** 护甲相关提示：未受训、力量不足、隐匿劣势、所用的 AC 公式 */
  armorNotes: string[]
  saves: AbilityKey[]
  profSkills: Set<SkillKey>
  /** 种族/专长里的自选技能熟练 */
  skillChoices: SkillChoice[]
  expertiseSources: { source: string; count: number }[]
  expertiseCount: number
  /** 生效的专精技能 */
  expertise: SkillKey[]
  /** 万事通：非熟练技能加一半熟练加值 */
  jack: boolean
  skillBonus: Record<SkillKey, number>
  initiative: number
  /** 特性直接给的语言（不占自选名额） */
  grantedLanguages: string[]
  /** 最终语言：通用语 + 赋予 + 自选（超出名额的不计） */
  languages: string[]
  /** 背景工具（已代入具体选择）+ 兼职工具 */
  tools: string
  passivePerception: number
  profs: ProficiencySummary
  slots: SlotResult
  /** 施法职业及其施法属性（兼职时各用各的） */
  casters: { inst: ClassInstance; ability: AbilityKey }[]
  feats: FeatEntry[]
  classFeatures: ClassFeatureGroup[]
  granted: GrantedSpell[]
  spells: SpellPick[]
  weapons: WeaponAttack[]
  /** 职业资源（写入 limits）与职业数值 */
  resources: ClassResources
  /** 可选的武器精通数量 */
  masteryCount: number
  masteryIds: string[]
  equipment: string[]
  sizeCn: string
  speed: number
}

/**
 * 专长先决：解析描述首行「（先决：等级4+，力量或敏捷13+）」，返回不满足的条目。
 * 认得等级、属性 13+（「或」为任选）、护甲/盾牌受训、施法特性；其他先决不判断。
 * ponytail: 用当前总值判断属性，不回溯到取得该专长时的数值。
 */
export function featPrereqUnmet(
  desc: string,
  d: Pick<DerivedCharacter, 'level' | 'abilities' | 'profs' | 'casters' | 'slots'>
): string[] {
  const m = desc.match(/先决[：:]([^）)\n]+)/)
  if (!m) return []
  const out: string[] = []
  for (const part of m[1].split(/[，,；;]/).map(s => s.trim()).filter(Boolean)) {
    const lv = part.match(/等级\s*(\d+)/)
    const score = part.match(/(\d+)\s*\+?$/)
    const armor = part.match(/(轻甲|中甲|重甲|盾牌)受训/)
    if (lv) {
      if (d.level < +lv[1]) out.push(part)
    } else if (armor) {
      const key = ({ 轻甲: 'light', 中甲: 'medium', 重甲: 'heavy', 盾牌: 'shield' } as const)[armor[1] as '轻甲']
      if (!d.profs[key]) out.push(part)
    } else if (/施法|契约魔法/.test(part)) {
      if (!d.casters.length && !d.slots.pact) out.push(part)
    } else if (score) {
      const groups = parsePrereq(part)
      if (groups.length && !groups.every(g => g.some(k => d.abilities.total[k] >= +score[1]))) out.push(part)
    }
  }
  return out
}

/** 种族特质授予的技能熟练（如「小兔感官：你拥有察觉技能的熟练」） */
function traitSkills(traits: TraitEntry[]): SkillKey[] {
  const out: SkillKey[] = []
  for (const t of traits) {
    const m = t.desc.match(/拥有(?:对)?([^\n。，]{1,6})技能的熟练|获得([^\n。，]{1,6})技能熟练/)
    const sk = m ? cnToSkill((m[1] ?? m[2]).trim()) : null
    if (sk) out.push(sk)
  }
  return out
}

export function deriveCharacter(c: CharacterChoices, loaded: LoadedEntities): DerivedCharacter {
  const species = loaded.species ?? undefined
  const bg = loaded.background ?? undefined
  const instances = classInstances(c, loaded)
  const abilities = deriveAbilities(c, loaded.background, species, loaded)
  const pb = proficiencyBonus(c.level)
  const spTraits = speciesTraits(species, c.subraceChoice)

  const armor = ARMORS.find(a => a.id === c.armorId) ?? ARMORS[0]

  const profSkills = new Set<SkillKey>([
    ...(bg?.skills ?? []),
    ...c.classSkills,
    // 兼职职业给的那一项自选技能
    ...(c.multiclasses ?? []).map(m => m.skill).filter((x): x is SkillKey => !!x),
    ...traitSkills(spTraits),
  ])
  const choicesOfSkills = skillChoices(c, loaded)
  for (const s of pickedSkills(choicesOfSkills, c.skillPicks)) profSkills.add(s)

  // ---- 专长：起源 + 仍存在的升级槽位 ----
  const live = activeFeats(c, loaded)
  const feats: FeatEntry[] = []
  if (bg?.feat) {
    const origin = live.origin
    feats.push(origin
      ? { kind: 'origin', tag: '起源', name: origin.name, desc: origin.desc }
      : { kind: 'origin', tag: '起源', name: bg.feat, desc: `来自背景「${bg.nameCn}」。` })
  }
  for (const slot of allFeatSlots(c, loaded)) {
    const f = live[slot.key]
    if (!f) continue
    const tag =
      slot.kind === 'style' ? '战斗风格' :
      slot.kind === 'epic' ? '传奇恩惠' :
      slot.label.replace(/ · .*$/, '')
    feats.push({ kind: slot.kind, tag, name: f.name, desc: f.desc })
  }

  // ---- 职业特性：按各职业自己的等级 ----
  const classFeatures: ClassFeatureGroup[] = instances.map(inst => {
    const map = new Map<number, string[]>()
    for (const f of gainedFeatures(inst.cls, inst.level)) {
      map.set(f.level, [...(map.get(f.level) ?? []), f.name])
    }
    return {
      inst,
      byLevel: [...map.entries()].sort((a, b) => a[0] - b[0]),
      subclassFeatures: (inst.subclass?.features ?? [])
        .map(feature => ({ level: subclassFeatureLevel(feature.name), feature }))
        .filter(x => x.level <= inst.level),
    }
  })

  // ---- 法术：自选 + 特性赋予 + 手动补充；元数据从未过滤的全表回查 ----
  const granted = grantedSpells(c, loaded)
  const byName = new Map(
    (loaded.spellList?.all ?? loaded.spellList?.spells ?? []).map(s => [s.name, s])
  )
  const spells: SpellPick[] = [
    ...c.spells.map(name => ({ name, entry: byName.get(name), source: '' })),
    ...granted
      .filter(g => !c.spells.includes(g.name))
      .map(g => ({ name: g.name, entry: byName.get(g.name), source: g.source })),
    ...c.spellsText.split('\n').map(s => s.trim()).filter(Boolean)
      .map(name => ({ name, entry: undefined, source: '' })),
  ]

  const profs = proficiencySummary(instances)
  const mods = abilities.mods
  const featNames = feats.map(f => f.name)
  const hasFeat = (re: RegExp) => featNames.some(n => re.test(n))
  const gained = instances.map(inst => ({ inst, names: gainedFeatures(inst.cls, inst.level).map(f => f.name) }))

  // ---- 武器：熟练、战斗风格、精通 ----
  // 精通数量：职业表「武器精通」列；没有该列的职业（圣武士、游侠）为 2；武器大师专长 +1
  const masteryCount =
    gained.reduce((n, { inst, names }) => {
      const col = inst.cls.levels.find(r => r.level === inst.level)?.extras['武器精通']
      return n + (col && /^\d+$/.test(col) ? parseInt(col, 10) : names.includes('武器精通') ? 2 : 0)
    }, 0) + featNames.filter(n => /武器大师/.test(n)).length
  // 只认仍熟练的武器；超出名额的保留在草稿里但不生效
  const masteryIds = (c.masteryIds ?? []).filter(id => {
    const w = WEAPONS.find(x => x.id === id)
    return !!w && weaponProficient(w, profs.weapons)
  }).slice(0, masteryCount)
  const archery = hasFeat(/箭术|Archery/)
  const dueling = hasFeat(/对决|Dueling/)
  const thrownStyle = hasFeat(/投掷武器战斗/)
  const gwf = hasFeat(/巨武器战斗/)

  const weapons: WeaponAttack[] = c.weaponIds
    .map(id => WEAPONS.find(w => w.id === id))
    .filter((w): w is WeaponDef => !!w)
    .map(def => {
      const ability = weaponAttackAbility(def, mods.STR, mods.DEX)
      const mod = mods[ability]
      const proficient = weaponProficient(def, profs.weapons)
      const notes: string[] = []
      let damageBonus = mod
      if (!proficient) notes.push('未熟练：攻击不加熟练加值')
      if (archery && def.ranged && !def.thrown) notes.push('箭术 +2 命中')
      if (dueling && !def.ranged && !def.twoHanded) {
        damageBonus += 2
        notes.push('对决 +2 伤害（单手持用、未持其他武器时）')
      }
      if (thrownStyle && def.thrown) notes.push('投掷武器战斗：投掷命中 +2 伤害')
      if (gwf && !def.ranged && (def.twoHanded || def.versatile)) notes.push('巨武器战斗：双手持握时伤害骰 1、2 视为 3')
      return {
        def, ability, mod, damageBonus, proficient, notes,
        attackBonus: mod + (proficient ? pb : 0) + (archery && def.ranged && !def.thrown ? 2 : 0),
        mastery: masteryIds.includes(def.id) ? def.mastery : null,
      }
    })

  // ---- 技能：专精、万事通、先攻 ----
  const expSources = expertiseSources(instances, Object.values(live))
  const expertiseCount = expSources.reduce((n, s) => n + s.count, 0)
  const expertise = (c.expertise ?? []).filter(s => profSkills.has(s)).slice(0, expertiseCount)
  const jack = gained.some(g => g.names.includes('万事通'))
  const skillBonus = Object.fromEntries(SKILL_KEYS.map(s => {
    const prof = expertise.includes(s) ? 2 * pb : profSkills.has(s) ? pb : jack ? Math.floor(pb / 2) : 0
    return [s, mods[SKILL_ABILITY[s]] + prof]
  })) as Record<SkillKey, number>
  const initiative = mods.DEX + (hasFeat(/^警戒|Alert/) ? pb : 0)

  // ---- 语言与工具 ----
  const langsGranted = grantedLanguages(
    species?.languageText ?? '', gained.flatMap(g => g.names), [...STANDARD_LANGUAGES, ...RARE_LANGUAGES.map(r => r.name)]
  )
  const freeLangs = c.languages.filter(l => l !== '通用语' && !langsGranted.includes(l)).slice(0, LANGUAGE_PICKS)
  const languages = [...new Set(['通用语', ...langsGranted, ...freeLangs])]
  const toolOpts = bg ? toolOptions(bg.tool) : null
  const bgTool = toolOpts?.includes(c.toolChoice) ? c.toolChoice : bg?.tool ?? ''
  const tools = [bgTool, profs.tools].filter(Boolean).join('、')

  // ---- 护甲等级：可用公式取最高（兼职时多个无甲防御也只能取其一） ----
  const armorNotes: string[] = []
  const trained = armorTrained(armor, profs)
  const shieldOk = c.shield && profs.shield
  if (!trained) armorNotes.push(`未受训${armor.category}：力量/敏捷相关 D20 检定劣势，且无法施法`)
  if (c.shield && !profs.shield) armorNotes.push('未受训盾牌：不提供 AC 加值')
  if (armor.stealthDisadv) armorNotes.push('隐匿检定劣势')
  const slowed = !!armor.strReq && abilities.total.STR < armor.strReq
  if (slowed) armorNotes.push(`力量低于 ${armor.strReq}：速度 −10 尺`)
  const formulas: { label: string; ac: number }[] = [
    { label: armor.id === 'none' ? '10+敏捷' : armor.nameCn, ac: armorClassValue(armor, mods.DEX, false) },
  ]
  if (armor.id === 'none') {
    for (const { inst, names } of gained) {
      if (!names.some(n => /无甲防御/.test(n))) continue
      // 武僧的无甲防御不能持盾
      if (/武僧/.test(inst.cls.nameCn)) {
        if (!c.shield) formulas.push({ label: '无甲防御（感知）', ac: 10 + mods.DEX + mods.WIS })
      } else {
        formulas.push({ label: '无甲防御（体质）', ac: 10 + mods.DEX + mods.CON })
      }
    }
  }
  const best = formulas.reduce((a, b) => (b.ac > a.ac ? b : a))
  if (best !== formulas[0]) armorNotes.push(best.label)
  const defense = hasFeat(/^防御(\s|$)/) && armor.id !== 'none'
  if (defense) armorNotes.push('防御战斗风格 +1')
  const ac = best.ac + (shieldOk ? 2 : 0) + (defense ? 1 : 0)
  if (armor.id === 'none' && c.spells.includes('法师护甲')) {
    armorNotes.push(`法师护甲生效时 AC ${Math.max(ac, 13 + mods.DEX + (shieldOk ? 2 : 0))}`)
  }

  // ---- 速度：种族基础 + 职业加速 − 重甲力量不足 ----
  let speed = species?.speed || 30
  for (const { inst, names } of gained) {
    const row = inst.cls.levels.find(r => r.level === inst.level)
    const unarmored = row?.extras['无甲移动']?.match(/\d+/)
    if (unarmored && armor.id === 'none' && !c.shield) speed += parseInt(unarmored[0], 10)
    if (names.some(n => /快速移动/.test(n)) && armor.category !== '重甲') speed += 10
  }
  if (slowed) speed -= 10

  const cls = loaded.cls
  const equipment: string[] = []
  if (cls && cls.equipmentOptions[c.classEquipChoice]) {
    equipment.push(`职业装备：${cls.equipmentOptions[c.classEquipChoice]}`)
  }
  if (bg && bg.equipmentOptions[c.bgEquipChoice]) {
    equipment.push(`背景装备：${bg.equipmentOptions[c.bgEquipChoice]}`)
  }

  return {
    c,
    loaded,
    instances,
    multiclassed: instances.length > 1,
    level: c.level,
    pb,
    abilities,
    spTraits,
    subraceName: effectiveSubrace(species, c.subraceChoice),
    hp: deriveHp(c, loaded, spTraits, abilities.mods.CON),
    armor,
    ac,
    armorNotes,
    // 豁免熟练只来自起始职业（兼职规则）
    saves: cls?.saves ?? [],
    profSkills,
    skillChoices: choicesOfSkills,
    expertiseSources: expSources,
    expertiseCount,
    expertise,
    jack,
    skillBonus,
    initiative,
    grantedLanguages: langsGranted,
    languages,
    tools,
    passivePerception: 10 + skillBonus.perception,
    profs,
    slots: spellSlotsFor(instances),
    casters: instances
      .map(inst => ({ inst, ability: spellAbilityOf(inst) }))
      .filter((x): x is { inst: ClassInstance; ability: AbilityKey } => !!x.ability),
    feats,
    classFeatures,
    granted,
    spells,
    weapons,
    resources: classResources(instances, abilities.mods),
    masteryCount,
    masteryIds,
    equipment,
    sizeCn: c.sizeChoice || species?.sizeOptions[0] || '中型',
    speed,
  }
}
