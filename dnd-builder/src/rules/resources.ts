// 职业资源：怒气、术法点、引导神力、回气……写入 E5 的 limits，并汇总职业数值（偷袭骰、武艺骰等）。
//
// 数据来源有两类：
//   1) 职业表的额外列（ClassLevelRow.extras），按该职业自己的等级取值；
//   2) 按公式计算、表里没有的常见资源（圣疗池、吟游激励、动作如潮、不屈），按已获得的特性判断。

import type { AbilityKey, LimitedUse } from '../types'
import { gainedFeatures } from './build'
import type { ClassInstance } from './multiclass'

/** 法术位/法术数量列已在施法部分处理 */
const SPELL_COLUMN = /^([一二三四五六七八九]环|戏法|准备法术|法术位|法术位环阶|已知法术)$/
/** 「可以掌握几项」的数量列，不是可消耗的次数 */
const KNOWN_COUNT = /已知|祈唤|恩惠|方案|魔法物品|精通|骰数/

/** 已知资源的恢复方式（2024 规则）；未列出的按长休恢复 */
const RECOVERY: [RegExp, string[], string?][] = [
  [/狂暴/, ['长休'], '短休恢复 1 次'],
  [/引导神力|回气|荒野变形/, ['长休'], '短休恢复 1 次'],
  [/功力|锐气/, ['短休', '长休']],
  [/术法点|宿敌|鲜血点/, ['长休']],
]

export interface ClassResources {
  limits: LimitedUse[]
  /** 非次数类的职业数值：偷袭 3d6、武艺骰 1d8、狂暴伤害 +2…… */
  values: { name: string; value: string; className: string }[]
}

function recoveryOf(name: string): { resets: string[]; description?: string } {
  for (const [re, resets, description] of RECOVERY) {
    if (re.test(name)) return { resets, description }
  }
  return { resets: ['长休'] }
}

export function classResources(
  instances: ClassInstance[],
  mods: Record<AbilityKey, number>
): ClassResources {
  const limits: LimitedUse[] = []
  const values: ClassResources['values'] = []
  const multi = instances.length > 1

  for (const inst of instances) {
    const row = inst.cls.levels.find(r => r.level === inst.level)
    const tag = multi ? `（${inst.cls.nameCn}）` : ''

    // 1) 职业表额外列
    for (const [name, raw] of Object.entries(row?.extras ?? {})) {
      const v = raw.trim()
      if (!v || /^[—\-－]+$/.test(v) || SPELL_COLUMN.test(name)) continue
      if (/^\d+$/.test(v) && !KNOWN_COUNT.test(name)) {
        limits.push({ name: name + tag, uses: parseInt(v, 10), ...recoveryOf(name) })
      } else {
        values.push({ name, value: v, className: inst.cls.nameCn })
      }
    }

    // 2) 表里没有、按公式给出的常见资源
    const gained = new Set(gainedFeatures(inst.cls, inst.level).map(f => f.name))
    const has = (re: RegExp) => [...gained].some(n => re.test(n))
    if (has(/圣疗/)) {
      limits.push({
        name: '圣疗池' + tag, uses: 5 * inst.level, resets: ['长休'],
        description: '治疗能量池（生命值点数）= 圣武士等级 × 5',
      })
    }
    if (has(/吟游激励/)) {
      limits.push({
        name: '吟游激励' + tag, uses: Math.max(1, mods.CHA), resets: ['长休'],
        description: has(/激励之源/) ? '次数 = 魅力调整值；激励之源：短休也恢复' : '次数 = 魅力调整值（至少 1）',
      })
    }
    if (has(/动作如潮/)) {
      limits.push({ name: '动作如潮' + tag, uses: inst.level >= 17 ? 2 : 1, resets: ['短休', '长休'] })
    }
    if (has(/不屈/)) {
      limits.push({ name: '不屈' + tag, uses: inst.level >= 17 ? 3 : inst.level >= 13 ? 2 : 1, resets: ['长休'] })
    }
  }
  return { limits, values }
}
