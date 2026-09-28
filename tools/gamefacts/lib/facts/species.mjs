import { enumValue, need } from '../game.mjs';
import { compareText } from '../output.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const WORK_PREFIX = 'WorkSuitability_';

export class Species {
  constructor(game) {
    this.game = game;
    this.monsters = game.dataTable(TABLES.monsters);
    this.humans = game.dataTable(TABLES.humans);
    this.entries = [];
    this.byTribe = new Map();
    this.buildEntries();
  }

  buildEntries() {
    const groups = new Map();
    for (const [rowName, row] of this.monsters.rows) {
      const number = need(row.ZukanIndex, `${rowName}.ZukanIndex`);
      if (number <= 0) continue;
      const key = `${number}|${row.ZukanIndexSuffix ?? ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rowName);
    }
    for (const rowNames of groups.values()) {
      const canonical = rowNames.filter(
        (rowName) =>
          rowName.toLowerCase() === enumValue(this.monsters.row(rowName).Tribe).toLowerCase()
      );
      if (canonical.length !== 1) {
        throw new Error(`Palpedia entry for ${rowNames.join(', ')} has no single canonical row`);
      }
      const id = canonical[0];
      const row = this.monsters.row(id);
      const entry = {
        id,
        tribe: enumValue(row.Tribe),
        number: row.ZukanIndex,
        suffix: row.ZukanIndexSuffix ?? '',
        row
      };
      this.entries.push(entry);
      this.byTribe.set(entry.tribe.toLowerCase(), entry);
    }
    this.entries.sort((a, b) => a.number - b.number || compareText(a.suffix, b.suffix));
  }

  workSuitabilityIds() {
    const first = this.entries[0].row;
    return Object.keys(first)
      .filter((key) => key.startsWith(WORK_PREFIX))
      .map((key) => key.slice(WORK_PREFIX.length));
  }

  entryForTribe(tribe) {
    return this.byTribe.get(String(tribe).toLowerCase()) ?? null;
  }

  monster(characterId) {
    return this.monsters.row(characterId) ?? null;
  }

  entryForCharacter(characterId) {
    const row = this.monster(characterId);
    return row ? this.entryForTribe(enumValue(row.Tribe)) : null;
  }

  palName(characterId) {
    const row = this.monster(characterId);
    if (!row) return null;
    const tribe = enumValue(row.Tribe);
    const entry = this.entryForTribe(tribe);
    return (
      this.game.lookupText([TEXTS.palNames], row.OverrideNameTextID) ??
      (entry ? this.game.lookupText([TEXTS.palNames], `PAL_NAME_${entry.id}`) : null) ??
      this.game.lookupText([TEXTS.palNames], `PAL_NAME_${tribe}`) ??
      this.game.lookupText([TEXTS.palNames], `PAL_NAME_${characterId}`)
    );
  }

  speciesName(entry) {
    return need(
      this.game.lookupText([TEXTS.palNames], `PAL_NAME_${entry.id}`) ??
        this.game.lookupText([TEXTS.palNames], `PAL_NAME_${entry.tribe}`),
      `English name of ${entry.id}`
    );
  }

  title(characterId) {
    const row = this.monster(characterId) ?? this.humans.row(characterId);
    return row ? this.game.lookupText([TEXTS.namePrefixes], row.NamePrefixID) : null;
  }

  humanName(characterId) {
    const row = this.humans.row(characterId);
    if (!row) return null;
    return (
      this.game.lookupText([TEXTS.humanNames, TEXTS.uniqueNpcNames], row.OverrideNameTextID) ??
      this.game.lookupText([TEXTS.humanNames, TEXTS.uniqueNpcNames], `NAME_${characterId}`)
    );
  }
}
