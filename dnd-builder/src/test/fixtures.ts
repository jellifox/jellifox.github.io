// 测试夹具：从仓库下载的真实页面（UTF-8 存档），在此统一解析，供各测试复用。
// 更新夹具：重新从 DND5eChm/DND5e_chm 下载对应页面并转为 UTF-8 覆盖 src/data/__fixtures__/。

import elfHtml from '../data/__fixtures__/elf2024.html?raw'
import corvumHtml from '../data/__fixtures__/corvum.html?raw'
import sorcererHtml from '../data/__fixtures__/sorcerer.html?raw'
import paladinHtml from '../data/__fixtures__/paladin.html?raw'
import fighterHtml from '../data/__fixtures__/fighter.html?raw'
import featsHtml from '../data/__fixtures__/general-feats.html?raw'
import spellsHtml from '../data/__fixtures__/spells.html?raw'
import { parseClass, parseFeatPage, parseSpecies, parseSpellList } from '../data/parsers'
import { DEFAULT_CHOICES } from '../state/draft'
import type {
  CharacterChoices, ClassData, LoadedEntities, SpellEntry, SubclassData,
} from '../types'

export const html = { elfHtml, corvumHtml, sorcererHtml, paladinHtml, fighterHtml, featsHtml, spellsHtml }

export const elf = parseSpecies(elfHtml, 'elf')!
export const corvum = parseSpecies(corvumHtml, 'corvum')!
export const sorcerer = parseClass(sorcererHtml, 'sorcerer')!
export const paladin = parseClass(paladinHtml, 'paladin')!
export const fighter = parseClass(fighterHtml, 'fighter')!
export const generalFeats = parseFeatPage(featsHtml)
export const spells: SpellEntry[] = parseSpellList(spellsHtml)

/** 奥法骑士：职业表里没有法术位，施法来自子职 */
export const eldritchKnight: SubclassData = {
  id: 'ek', nameCn: '奥法骑士', nameEn: 'Eldritch Knight', desc: '', features: [],
}

export function choices(patch: Partial<CharacterChoices> = {}): CharacterChoices {
  return { ...DEFAULT_CHOICES, ...patch }
}

export function loaded(patch: Partial<LoadedEntities> = {}): LoadedEntities {
  return {
    cls: null, subclass: null, species: null, background: null,
    spellList: { classTitle: '', spells, all: spells },
    multiclasses: {},
    ...patch,
  }
}

/** 兼职实体表：classUrl -> 已加载实体 */
export function mc(url: string, cls: ClassData, subclass: SubclassData | null = null) {
  return { [url]: { cls, subclass } }
}
