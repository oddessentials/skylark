import { enumValue, need } from '../game.mjs';
import { compareText } from '../output.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const ROLE_PREFIXES = [
  ['BOSS_', 'alpha'],
  ['GYM_', 'tower'],
  ['RAID_', 'raid'],
  ['PREDATOR_', 'predator'],
  ['SUMMON_', 'summon'],
  ['POLICE_', 'police'],
  ['Quest_', 'quest']
];

function roleOf(characterId) {
  for (const [prefix, role] of ROLE_PREFIXES) {
    if (characterId.startsWith(prefix)) return role;
  }
  return 'normal';
}

function elementsOf(row) {
  return [row.ElementType1, row.ElementType2]
    .map((value) => enumValue(value))
    .filter((value) => value !== 'None');
}

export function buildPals(game, species, gameVersion) {
  const workIds = species.workSuitabilityIds();
  const workSuitabilities = workIds.map((id) => ({
    id,
    name: need(
      game.lookupText([TEXTS.ui], `COMMON_WORK_SUITABILITY_${id}`),
      `English name of work suitability ${id}`
    )
  }));

  const pals = species.entries.map((entry) => {
    const row = entry.row;
    const work = {};
    for (const id of workIds) {
      const level = row[`WorkSuitability_${id}`];
      if (level > 0) work[id] = level;
    }
    return {
      id: entry.id,
      tribe: entry.tribe,
      number: entry.number,
      suffix: entry.suffix,
      name: species.speciesName(entry),
      elements: elementsOf(row),
      rarity: row.Rarity,
      work,
      is_boss: row.IsBoss === true,
      is_tower_boss: row.IsTowerBoss === true,
      is_raid_boss: row.IsRaidBoss === true,
      uncapturable: row.IsUncapturable === true
    };
  });

  const blueprintClasses = game.dataTable(TABLES.blueprintClasses);
  const classes = new Map();
  for (const [characterId, row] of species.monsters.rows) {
    if (!row.BPClass || row.BPClass === 'None') continue;
    const classRow = blueprintClasses.row(row.BPClass);
    if (!classRow || typeof classRow.BPClass !== 'string' || !classRow.BPClass.includes('.')) {
      continue;
    }
    const className = classRow.BPClass.split('.').at(-1);
    const tribe = enumValue(row.Tribe);
    if (!classes.has(className)) {
      classes.set(className, { className, tribes: new Set(), characters: [], rows: [] });
    }
    const record = classes.get(className);
    record.tribes.add(tribe.toLowerCase());
    record.characters.push(characterId);
    record.rows.push(row);
  }

  const classMap = {};
  const sortedClasses = [...classes.values()].sort((a, b) => compareText(a.className, b.className));
  for (const record of sortedClasses) {
    if (record.tribes.size !== 1) {
      throw new Error(`${record.className} maps to more than one tribe`);
    }
    const characters = [...record.characters].sort(compareText);
    const entry = species.entryForCharacter(characters[0]);
    classMap[record.className] = {
      species: entry ? entry.id : null,
      tribe: enumValue(record.rows[0].Tribe),
      name: entry ? species.speciesName(entry) : species.palName(characters[0]),
      roles: [...new Set(characters.map(roleOf))].sort(compareText),
      characters,
      is_boss: record.rows.some((row) => row.IsBoss === true),
      is_tower_boss: record.rows.some((row) => row.IsTowerBoss === true),
      is_raid_boss: record.rows.some((row) => row.IsRaidBoss === true)
    };
  }

  return {
    game_version: gameVersion,
    sources: [TABLES.monsters, TABLES.blueprintClasses, TEXTS.palNames, TEXTS.ui],
    work_suitabilities: workSuitabilities,
    pals,
    classes: classMap
  };
}
