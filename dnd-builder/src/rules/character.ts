// 统一推导模型：把「用户选择 + 已加载的规则数据」一次性算成一个完整的角色。
//
// 角色卡预览（statblock.ts）与面团导出（mianbuan.ts）都只消费这里的结果、只负责序列化。
// 以前两边各自重算技能、特性、法术位，改一处漏一处；现在任何规则修正只改这一个地方。

import type {
  AbilityKey, CharacterChoices, LoadedEntities, SkillKey, SpellEntry, TraitEntry,
} from '../types'
import { cnToSkill } from '../data/mappings'
import { subclassFeatureLevel } from '../data/parsers'
import {
  activeFeats, allFeatSlots, deriveAbilities, deriveHp, effectiveSubrace,
  gainedFeatures, speciesTraits, type DerivedAbilities,
} from './build'
import {
  classInstances, proficiencySummary, spellAbilityOf, spellSlotsFor,
  type ClassInstance, type ProficiencySummary, type SlotResult,
} from './multiclass'
import {
  ARMORS, WEAPONS, armorClassValue, proficiencyBonus, weaponAttackAbility,
  type ArmorDef, type WeaponDef,
} from './rules'
import { grantedSpells, type GrantedSpell } from './spells'
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
  saves: AbilityKey[]
  profSkills: Set<SkillKey>
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
  equipment: string[]
  sizeCn: string
  speed: number
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

  const weapons: WeaponAttack[] = c.weaponIds
    .map(id => WEAPONS.find(w => w.id === id))
    .filter((w): w is WeaponDef => !!w)
    .map(def => {
      const ability = weaponAttackAbility(def, abilities.mods.STR, abilities.mods.DEX)
      const mod = abilities.mods[ability]
      return { def, ability, mod, attackBonus: mod + pb }
    })

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
    ac: armorClassValue(armor, abilities.mods.DEX, c.shield),
    // 豁免熟练只来自起始职业（兼职规则）
    saves: cls?.saves ?? [],
    profSkills,
    passivePerception: 10 + abilities.mods.WIS + (profSkills.has('perception') ? pb : 0),
    profs: proficiencySummary(instances),
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
    equipment,
    sizeCn: c.sizeChoice || species?.sizeOptions[0] || '中型',
    speed: species?.speed || 30,
  }
}
