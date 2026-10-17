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

/** 每级升级取的固定平均值（2024 规则：⌈(骰面+1)/2⌉） */
export function hpPerLevelAverage(hitDie: number): number {
  return Math.ceil((hitDie + 1) / 2)
}

export function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides)
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
  /** 重甲的力量需求，不足时速度 −10 尺 */
  strReq?: number
}

export const ARMORS: ArmorDef[] = [
  { id: 'none', nameCn: '无甲', nameEn: 'Unarmored', category: '无甲', base: 10, addDex: true, maxDex: null },
  { id: 'padded', nameCn: '布甲', nameEn: 'Padded', category: '轻甲', base: 11, addDex: true, maxDex: null, stealthDisadv: true },
  { id: 'leather', nameCn: '皮甲', nameEn: 'Leather', category: '轻甲', base: 11, addDex: true, maxDex: null },
  { id: 'studded', nameCn: '镶钉皮甲', nameEn: 'Studded Leather', category: '轻甲', base: 12, addDex: true, maxDex: null },
  { id: 'hide', nameCn: '兽皮甲', nameEn: 'Hide', category: '中甲', base: 12, addDex: true, maxDex: 2 },
  { id: 'chain-shirt', nameCn: '链甲衫', nameEn: 'Chain Shirt', category: '中甲', base: 13, addDex: true, maxDex: 2 },
  { id: 'scale', nameCn: '鳞甲', nameEn: 'Scale Mail', category: '中甲', base: 14, addDex: true, maxDex: 2, stealthDisadv: true },
  { id: 'breastplate', nameCn: '胸甲', nameEn: 'Breastplate', category: '中甲', base: 14, addDex: true, maxDex: 2 },
  { id: 'half-plate', nameCn: '半身板甲', nameEn: 'Half Plate', category: '中甲', base: 15, addDex: true, maxDex: 2, stealthDisadv: true },
  { id: 'ring', nameCn: '环甲', nameEn: 'Ring Mail', category: '重甲', base: 14, addDex: false, maxDex: 0, stealthDisadv: true },
  { id: 'chain-mail', nameCn: '链甲', nameEn: 'Chain Mail', category: '重甲', base: 16, addDex: false, maxDex: 0, stealthDisadv: true, strReq: 13 },
  { id: 'splint', nameCn: '板条甲', nameEn: 'Splint', category: '重甲', base: 17, addDex: false, maxDex: 0, stealthDisadv: true, strReq: 15 },
  { id: 'plate', nameCn: '板甲', nameEn: 'Plate', category: '重甲', base: 18, addDex: false, maxDex: 0, stealthDisadv: true, strReq: 15 },
]

export function armorClassValue(armor: ArmorDef, dexMod: number, shield: boolean): number {
  let ac = armor.base
  if (armor.addDex) {
    ac += armor.maxDex == null ? dexMod : Math.min(dexMod, armor.maxDex)
  }
  if (shield) ac += 2
  return ac
}

/** 护甲受训：熟练文本来自 proficiencySummary 的 light/medium/heavy */
export function armorTrained(a: ArmorDef, p: { light: boolean; medium: boolean; heavy: boolean }): boolean {
  return a.category === '无甲' || (a.category === '轻甲' && p.light) ||
    (a.category === '中甲' && p.medium) || (a.category === '重甲' && p.heavy)
}

// ---------- 武器（2024 玩家手册武器表，属规则常量；id 保持旧值以兼容草稿） ----------

export interface WeaponDef {
  id: string
  nameCn: string
  nameEn: string
  dice: string
  damageType: string
  /** 军用武器；否则为简易武器 */
  martial?: boolean
  /** 精通词条（2024） */
  mastery: string
  finesse?: boolean
  ranged?: boolean
  range?: string
  versatile?: string
  twoHanded?: boolean
  light?: boolean
  thrown?: boolean
  reach?: boolean
}

const W = (
  id: string, nameCn: string, nameEn: string, dice: string, damageType: string, mastery: string,
  props: Partial<WeaponDef> = {}
): WeaponDef => ({ id, nameCn, nameEn, dice, damageType, mastery, ...props })

export const WEAPONS: WeaponDef[] = [
  // 简易近战
  W('club', '短棒', 'Club', '1d4', '钝击', '缓速', { light: true }),
  W('dagger', '匕首', 'Dagger', '1d4', '穿刺', '迅击', { finesse: true, light: true, thrown: true, range: '20/60' }),
  W('greatclub', '巨棒', 'Greatclub', '1d8', '钝击', '推离', { twoHanded: true }),
  W('handaxe', '手斧', 'Handaxe', '1d6', '挥砍', '侵扰', { light: true, thrown: true, range: '20/60' }),
  W('javelin', '标枪', 'Javelin', '1d6', '穿刺', '缓速', { thrown: true, range: '30/120' }),
  W('light-hammer', '轻锤', 'Light Hammer', '1d4', '钝击', '迅击', { light: true, thrown: true, range: '20/60' }),
  W('mace', '硬头锤', 'Mace', '1d6', '钝击', '削弱'),
  W('quarterstaff', '长棍', 'Quarterstaff', '1d6', '钝击', '失衡', { versatile: '1d8' }),
  W('sickle', '镰刀', 'Sickle', '1d4', '挥砍', '迅击', { light: true }),
  W('spear', '矛', 'Spear', '1d6', '穿刺', '削弱', { versatile: '1d8', thrown: true, range: '20/60' }),
  // 简易远程
  W('dart', '飞镖', 'Dart', '1d4', '穿刺', '侵扰', { ranged: true, finesse: true, thrown: true, range: '20/60' }),
  W('light-crossbow', '轻弩', 'Light Crossbow', '1d8', '穿刺', '缓速', { ranged: true, range: '80/320', twoHanded: true }),
  W('shortbow', '短弓', 'Shortbow', '1d6', '穿刺', '侵扰', { ranged: true, range: '80/320', twoHanded: true }),
  W('sling', '投石索', 'Sling', '1d4', '钝击', '缓速', { ranged: true, range: '30/120' }),
  // 军用近战
  W('battleaxe', '战斧', 'Battleaxe', '1d8', '挥砍', '失衡', { martial: true, versatile: '1d10' }),
  W('flail', '链枷', 'Flail', '1d8', '钝击', '削弱', { martial: true }),
  W('glaive', '长柄刀', 'Glaive', '1d10', '挥砍', '擦掠', { martial: true, twoHanded: true, reach: true }),
  W('greataxe', '巨斧', 'Greataxe', '1d12', '挥砍', '横扫', { martial: true, twoHanded: true }),
  W('greatsword', '巨剑', 'Greatsword', '2d6', '挥砍', '擦掠', { martial: true, twoHanded: true }),
  W('halberd', '戟', 'Halberd', '1d10', '挥砍', '横扫', { martial: true, twoHanded: true, reach: true }),
  W('lance', '骑枪', 'Lance', '1d10', '穿刺', '失衡', { martial: true, twoHanded: true, reach: true }),
  W('longsword', '长剑', 'Longsword', '1d8', '挥砍', '削弱', { martial: true, versatile: '1d10' }),
  W('maul', '巨锤', 'Maul', '2d6', '钝击', '失衡', { martial: true, twoHanded: true }),
  W('morningstar', '钉头锤', 'Morningstar', '1d8', '穿刺', '削弱', { martial: true }),
  W('pike', '长矛', 'Pike', '1d10', '穿刺', '推离', { martial: true, twoHanded: true, reach: true }),
  W('rapier', '刺剑', 'Rapier', '1d8', '穿刺', '侵扰', { martial: true, finesse: true }),
  W('scimitar', '弯刀', 'Scimitar', '1d6', '挥砍', '迅击', { martial: true, finesse: true, light: true }),
  W('shortsword', '短剑', 'Shortsword', '1d6', '穿刺', '侵扰', { martial: true, finesse: true, light: true }),
  W('trident', '三叉戟', 'Trident', '1d8', '穿刺', '失衡', { martial: true, versatile: '1d10', thrown: true, range: '20/60' }),
  W('warpick', '战镐', 'Warpick', '1d8', '穿刺', '削弱', { martial: true, versatile: '1d10' }),
  W('warhammer', '战锤', 'Warhammer', '1d8', '钝击', '推离', { martial: true, versatile: '1d10' }),
  W('whip', '鞭', 'Whip', '1d4', '挥砍', '缓速', { martial: true, finesse: true, reach: true }),
  // 军用远程
  W('blowgun', '吹箭筒', 'Blowgun', '1', '穿刺', '侵扰', { martial: true, ranged: true, range: '25/100' }),
  W('hand-crossbow', '手弩', 'Hand Crossbow', '1d6', '穿刺', '侵扰', { martial: true, ranged: true, range: '30/120', light: true }),
  W('heavy-crossbow', '重弩', 'Heavy Crossbow', '1d10', '穿刺', '推离', { martial: true, ranged: true, range: '100/400', twoHanded: true }),
  W('longbow', '长弓', 'Longbow', '1d8', '穿刺', '缓速', { martial: true, ranged: true, range: '150/600', twoHanded: true }),
  W('musket', '火铳', 'Musket', '1d12', '穿刺', '缓速', { martial: true, ranged: true, range: '40/120', twoHanded: true }),
  W('pistol', '手铳', 'Pistol', '1d10', '穿刺', '侵扰', { martial: true, ranged: true, range: '30/90' }),
]

export function weaponAttackAbility(w: WeaponDef, strMod: number, dexMod: number): AbilityKey {
  if (w.ranged && !w.thrown) return 'DEX'
  if (w.finesse) return dexMod > strMod ? 'DEX' : 'STR'
  return w.ranged ? 'DEX' : 'STR'
}

/**
 * 武器熟练判定。熟练文本形如「简易和军用武器」「简易武器、具有灵巧或轻型词条的军用武器」
 * 「军用远程武器」，或直接列出武器名。
 */
export function weaponProficient(w: WeaponDef, profText: string): boolean {
  const q = profText.match(/具有([^、，]+?)词条的军用武器/)
  const rest = q ? profText.replace(q[0], '') : profText
  if (rest.includes(w.nameCn)) return true
  if (!w.martial) return /简易/.test(rest)
  if (/军用武器/.test(rest)) return true
  if (/军用远程武器/.test(rest) && w.ranged) return true
  return !!q && ((/灵巧/.test(q[1]) && !!w.finesse) || (/轻型/.test(q[1]) && !!w.light))
}
