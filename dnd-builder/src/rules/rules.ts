import type { AbilityKey } from '../types'

// ---------- 属性值 ----------

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

export const POINT_BUY_BUDGET = 27
export const POINT_BUY_MIN = 8
export const POINT_BUY_MAX = 15

export function pointBuyCost(score: number): number {
  // 8:0 9:1 10:2 11:3 12:4 13:5 14:7 15:9
  if (score <= 8) return 0
  if (score <= 13) return score - 8
  if (score === 14) return 7
  return 9
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4)
}

export function roll4d6DropLowest(): number {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6))
  dice.sort((a, b) => a - b)
  return dice[1] + dice[2] + dice[3]
}

/** 平均生命值：1 级取最大值，之后每级取骰子平均（向上取整）+体质 */
export function averageHp(hitDie: number, level: number, conMod: number): number {
  const perLevel = Math.ceil((hitDie + 1) / 2)
  const hp = hitDie + conMod + (level - 1) * (perLevel + conMod)
  return Math.max(level, hp)
}

/** 每级升级取的固定平均值（2024 规则：⌈(骰面+1)/2⌉） */
export function hpPerLevelAverage(hitDie: number): number {
  return Math.ceil((hitDie + 1) / 2)
}

export function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides)
}

/**
 * 按逐级投骰结果计算生命值上限：1 级固定取骰面最大值，
 * 2 级起用 rolls[i]（缺失的级数回退为该级平均值），每级都加体质调整值。
 * 生命值上限至少为角色等级（体质为负时兜底）。
 */
export function rolledHp(
  hitDie: number,
  level: number,
  conMod: number,
  rolls: number[]
): number {
  let hp = hitDie + conMod
  for (let lv = 2; lv <= level; lv++) {
    const r = rolls[lv - 2] ?? hpPerLevelAverage(hitDie)
    hp += r + conMod
  }
  return Math.max(level, hp)
}

// ---------- 护甲（2024 玩家手册装备表，属规则常量） ----------

export interface ArmorDef {
  id: string
  nameCn: string
  nameEn: string
  category: '无甲' | '轻甲' | '中甲' | '重甲'
  base: number
  addDex: boolean
  maxDex: number | null
  stealthDisadv?: boolean
}

export const ARMORS: ArmorDef[] = [
  { id: 'none', nameCn: '无甲', nameEn: 'Unarmored', category: '无甲', base: 10, addDex: true, maxDex: null },
  { id: 'leather', nameCn: '皮甲', nameEn: 'Leather', category: '轻甲', base: 11, addDex: true, maxDex: null },
  { id: 'studded', nameCn: '镶钉皮甲', nameEn: 'Studded Leather', category: '轻甲', base: 12, addDex: true, maxDex: null },
  { id: 'chain-shirt', nameCn: '链甲衫', nameEn: 'Chain Shirt', category: '中甲', base: 13, addDex: true, maxDex: 2 },
  { id: 'scale', nameCn: '鳞甲', nameEn: 'Scale Mail', category: '中甲', base: 14, addDex: true, maxDex: 2, stealthDisadv: true },
  { id: 'breastplate', nameCn: '胸甲', nameEn: 'Breastplate', category: '中甲', base: 14, addDex: true, maxDex: 2 },
  { id: 'half-plate', nameCn: '半身板甲', nameEn: 'Half Plate', category: '中甲', base: 15, addDex: true, maxDex: 2, stealthDisadv: true },
  { id: 'ring', nameCn: '环甲', nameEn: 'Ring Mail', category: '重甲', base: 14, addDex: false, maxDex: 0, stealthDisadv: true },
  { id: 'chain-mail', nameCn: '链甲', nameEn: 'Chain Mail', category: '重甲', base: 16, addDex: false, maxDex: 0, stealthDisadv: true },
  { id: 'splint', nameCn: '板条甲', nameEn: 'Splint', category: '重甲', base: 17, addDex: false, maxDex: 0, stealthDisadv: true },
  { id: 'plate', nameCn: '板甲', nameEn: 'Plate', category: '重甲', base: 18, addDex: false, maxDex: 0, stealthDisadv: true },
]

export function armorClassValue(armor: ArmorDef, dexMod: number, shield: boolean): number {
  let ac = armor.base
  if (armor.addDex) {
    ac += armor.maxDex == null ? dexMod : Math.min(dexMod, armor.maxDex)
  }
  if (shield) ac += 2
  return ac
}

// ---------- 武器（常用武器子集，2024 玩家手册装备表） ----------

export interface WeaponDef {
  id: string
  nameCn: string
  nameEn: string
  dice: string
  damageType: string
  finesse?: boolean
  ranged?: boolean
  range?: string
  versatile?: string
  twoHanded?: boolean
  light?: boolean
  thrown?: boolean
}

export const WEAPONS: WeaponDef[] = [
  { id: 'dagger', nameCn: '匕首', nameEn: 'Dagger', dice: '1d4', damageType: '穿刺', finesse: true, light: true, thrown: true, range: '20/60' },
  { id: 'club', nameCn: '短棒', nameEn: 'Club', dice: '1d4', damageType: '钝击', light: true },
  { id: 'quarterstaff', nameCn: '木棍', nameEn: 'Quarterstaff', dice: '1d6', damageType: '钝击', versatile: '1d8' },
  { id: 'mace', nameCn: '锤矛', nameEn: 'Mace', dice: '1d6', damageType: '钝击' },
  { id: 'spear', nameCn: '长矛', nameEn: 'Spear', dice: '1d6', damageType: '穿刺', versatile: '1d8', thrown: true, range: '20/60' },
  { id: 'javelin', nameCn: '标枪', nameEn: 'Javelin', dice: '1d6', damageType: '穿刺', thrown: true, range: '30/120' },
  { id: 'handaxe', nameCn: '手斧', nameEn: 'Handaxe', dice: '1d6', damageType: '挥砍', light: true, thrown: true, range: '20/60' },
  { id: 'shortsword', nameCn: '短剑', nameEn: 'Shortsword', dice: '1d6', damageType: '穿刺', finesse: true, light: true },
  { id: 'scimitar', nameCn: '弯刀', nameEn: 'Scimitar', dice: '1d6', damageType: '挥砍', finesse: true, light: true },
  { id: 'rapier', nameCn: '细剑', nameEn: 'Rapier', dice: '1d8', damageType: '穿刺', finesse: true },
  { id: 'longsword', nameCn: '长剑', nameEn: 'Longsword', dice: '1d8', damageType: '挥砍', versatile: '1d10' },
  { id: 'battleaxe', nameCn: '战斧', nameEn: 'Battleaxe', dice: '1d8', damageType: '挥砍', versatile: '1d10' },
  { id: 'warhammer', nameCn: '战锤', nameEn: 'Warhammer', dice: '1d8', damageType: '钝击', versatile: '1d10' },
  { id: 'greatsword', nameCn: '巨剑', nameEn: 'Greatsword', dice: '2d6', damageType: '挥砍', twoHanded: true },
  { id: 'greataxe', nameCn: '巨斧', nameEn: 'Greataxe', dice: '1d12', damageType: '挥砍', twoHanded: true },
  { id: 'maul', nameCn: '重锤', nameEn: 'Maul', dice: '2d6', damageType: '钝击', twoHanded: true },
  { id: 'glaive', nameCn: '长刃刀', nameEn: 'Glaive', dice: '1d10', damageType: '挥砍', twoHanded: true },
  { id: 'shortbow', nameCn: '短弓', nameEn: 'Shortbow', dice: '1d6', damageType: '穿刺', ranged: true, range: '80/320', twoHanded: true },
  { id: 'longbow', nameCn: '长弓', nameEn: 'Longbow', dice: '1d8', damageType: '穿刺', ranged: true, range: '150/600', twoHanded: true },
  { id: 'light-crossbow', nameCn: '轻弩', nameEn: 'Light Crossbow', dice: '1d8', damageType: '穿刺', ranged: true, range: '80/320', twoHanded: true },
  { id: 'hand-crossbow', nameCn: '手弩', nameEn: 'Hand Crossbow', dice: '1d6', damageType: '穿刺', ranged: true, range: '30/120', light: true },
  { id: 'heavy-crossbow', nameCn: '重弩', nameEn: 'Heavy Crossbow', dice: '1d10', damageType: '穿刺', ranged: true, range: '100/400', twoHanded: true },
]

export function weaponAttackAbility(w: WeaponDef, strMod: number, dexMod: number): AbilityKey {
  if (w.ranged) return 'DEX'
  if (w.finesse) return dexMod > strMod ? 'DEX' : 'STR'
  return 'STR'
}
