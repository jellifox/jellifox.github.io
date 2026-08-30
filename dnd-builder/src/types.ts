// ---------- E5StatblockIn 输出格式（与给定 JSON Schema 一一对应） ----------

export type AbilityKey = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'

export interface LimitedUse {
  name: string
  description?: string | null
  uses: number
  resets?: string[]
}

export interface Action {
  name: string
  desc: string
  attack_bonus?: number | null
  stat_bonus?: AbilityKey[]
  damage_dice?: string | null
  limit?: LimitedUse | null
}

export interface ArmorClass {
  value: number
  special?: string | null
}

export interface Hitpoints {
  value: number
  hit_dice?: string | null
}

export interface Speed {
  walk?: number | null
  fly?: number | null
  swim?: number | null
  climb?: number | null
  burrow?: number | null
  hover?: number | null
  lightwalking?: number | null
  notes?: string | null
}

export interface Stats {
  strength?: number | null
  dexterity?: number | null
  constitution?: number | null
  intelligence?: number | null
  wisdom?: number | null
  charisma?: number | null
}

export interface SavingThrows {
  strength_save?: number | null
  dexterity_save?: number | null
  constitution_save?: number | null
  intelligence_save?: number | null
  wisdom_save?: number | null
  charisma_save?: number | null
}

export type SkillKey =
  | 'acrobatics' | 'animal_handling' | 'arcana' | 'athletics' | 'deception'
  | 'history' | 'insight' | 'intimidation' | 'investigation' | 'medicine'
  | 'nature' | 'perception' | 'performance' | 'persuasion' | 'religion'
  | 'sleight_of_hand' | 'stealth' | 'survival'

export type Skills = Partial<Record<SkillKey, number | null>>

export interface SpellSlots {
  level: number
  limit: LimitedUse
}

export interface E5Statblock {
  name: string
  about?: string | null
  size: string
  type: string
  subtype?: string | null
  group?: string | null
  alignment?: string
  armor_class: ArmorClass
  hp: Hitpoints
  speed: Speed
  stats: Stats
  saving_throws: SavingThrows
  perception?: number | null
  skills?: Skills | null
  damage_vulnerabilities?: string | null
  damage_resistances?: string | null
  damage_immunities?: string | null
  condition_immunities?: string | null
  senses?: string[]
  languages?: string[]
  items?: string[]
  challenge_rating?: string | null
  cr?: number | null
  actions?: Action[]
  bonus_actions?: Action[]
  reactions?: Action[]
  legendary_desc?: string | null
  legendary_actions?: Action[]
  special_abilities?: Action[]
  spell_slots?: SpellSlots[]
  spells?: string[]
  spell_dc?: string | null
  spell_attack?: string | null
  limits?: LimitedUse[]
  source?: string | null
}

// ---------- 从仓库解析出的内容数据 ----------

export interface TraitEntry {
  name: string
  desc: string
}

/** 亚种：与种族共通特质并存的一组附加特质（如谦卑林鸦族下的昏鸦族/煽鸦族） */
export interface SubraceEntry {
  name: string
  desc: string
  traits: TraitEntry[]
  /** 以「属性值提升/增加」形式给出的加值原文（该类段落不进特质列表，但加值仍需生效） */
  abilityBonusText: string
}

export interface SpeciesData {
  id: string
  nameCn: string
  nameEn: string
  creatureType: string
  sizeOptions: string[] // ['中型'] 或 ['中型', '小型']
  sizeNote: string
  speed: number
  traits: TraitEntry[] // 共通特质
  subraces: SubraceEntry[] // 可选亚种，空数组表示该种族无亚种
  /** 同 SubraceEntry.abilityBonusText，种族层级的加值原文 */
  abilityBonusText: string
  desc: string
}

export interface BackgroundData {
  id: string
  nameCn: string
  nameEn: string
  abilities: AbilityKey[] // 可加值的三项属性
  feat: string
  skills: SkillKey[]
  skillsRaw: string
  tool: string
  equipmentOptions: string[]
  desc: string
}

export interface ClassLevelRow {
  level: number
  pb: number
  features: string[]
  cantrips?: number
  preparedSpells?: number
  slots?: Partial<Record<number, number>> // 环阶 -> 法术位数
  pactSlots?: { count: number; level: number }
  extras: Record<string, string>
}

export interface SubclassData {
  id: string
  nameCn: string
  nameEn: string
  desc: string
  features: TraitEntry[]
}

export interface ClassData {
  id: string
  nameCn: string
  nameEn: string
  flavor: string
  primaryAbility: string
  hitDie: number
  saves: AbilityKey[]
  skillChoiceCount: number
  skillChoices: SkillKey[] | 'any'
  skillChoicesRaw: string
  weaponProf: string
  armorTraining: string
  equipmentOptions: string[]
  spellAbility: AbilityKey | null
  levels: ClassLevelRow[]
  subclasses: SubclassData[]
}

export interface RepoMeta {
  sha: string
  shortSha: string
  branch: string
  commitDate: string
  fetchedAt: string
}

/** 万法大全速查表中的一个法术条目 */
export interface SpellEntry {
  ring: number // 0 = 戏法
  school: string
  name: string // 中文名+英文名
  source: string // 来源书缩写（PHB24 / XGE / TCE …）
  classes: string[] // 可用职业（中文全名，由速查表的单字缩写还原）
  castingTime: string
  components: string // 如 "V/S/M"
  ritual: boolean
  concentration: boolean
}

export interface SpellList {
  classTitle: string
  spells: SpellEntry[] // 该职业可选的法术
  all: SpellEntry[] // 未按职业过滤的全表（种族/专长赋予的法术不受职业列表限制）
}

/** 专长速查中的一页（一页含多个专长） */
export interface FeatPage {
  title: string
  feats: TraitEntry[]
}

/** 当前选中并已解析完成的实体集合 */
export interface LoadedEntities {
  cls: ClassData | null
  subclass: SubclassData | null
  species: SpeciesData | null
  background: BackgroundData | null
  spellList: SpellList | null
}

// ---------- 车卡过程中的用户选择 ----------

export type AbilityMethod = 'array' | 'pointbuy' | 'roll' | 'custom'

/** 生命值取值方式：固定平均值 / 逐级投骰 / 手动指定 */
export type HpMethod = 'average' | 'roll' | 'manual'

export interface CharacterChoices {
  name: string
  alignment: string
  level: number
  classUrl: string // 仓库内页面路径，即 TOC 索引中的 url
  subclassUrl: string
  speciesUrl: string
  subraceChoice: string // 亚种名称（种族无亚种时为空）
  sizeChoice: string
  backgroundUrl: string
  bgBonusMode: '2+1' | '1+1+1'
  bgPlus2: AbilityKey | null // 2+1 模式下 +2 的属性
  bgPlus1: AbilityKey | null // 2+1 模式下 +1 的属性
  speciesPicks: (AbilityKey | null)[] // 种族「自选加值」各槽位指向的属性（2014/第三方种族）
  traitOptions: Record<string, string> // 选项式特质（精灵血系、邪魔遗赠…）-> 所选行名
  abilityMethod: AbilityMethod
  hpMethod: HpMethod
  hpRolls: number[] // 逐级投骰结果，索引 0 对应 2 级（1 级固定取生命骰最大值）
  hpManual: number | null // 手动指定的生命值上限
  baseScores: Record<AbilityKey, number | null>
  rolledSets: number[][] // 投骰生成的 5 组候选数组
  rollSetIndex: number // 当前选用的组索引（-1 表示未选）
  classSkills: SkillKey[]
  classEquipChoice: number
  bgEquipChoice: number
  armorId: string
  shield: boolean
  weaponIds: string[]
  languages: string[]
  spells: string[] // 从法术速查中勾选的法术
  spellsText: string // 额外自由输入的法术
  feats: Record<string, TraitEntry> // 槽位 key（origin/style/lv4/lv19epic…）-> 已选专长快照
  about: string
}
