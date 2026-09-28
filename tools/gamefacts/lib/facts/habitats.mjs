import { enumValue, need } from '../game.mjs';
import { compareText } from '../output.mjs';
import { mapAt } from './coordinates.mjs';
import { TABLES } from './sources.mjs';

export const GRID = 100;
export const WAYS = ['wild', 'alpha', 'boss', 'egg', 'fished', 'caged', 'raid', 'bred'];

const ALPHA_PREFIX = 'BOSS_';
const ALPHA_ROW = /^boss_/i;

export function encodeRanges(cells) {
  const sorted = [...new Set(cells)].sort((a, b) => a - b);
  const runs = [];
  for (const cell of sorted) {
    const last = runs[runs.length - 1];
    if (last && cell === last[1] + 1) last[1] = cell;
    else runs.push([cell, cell]);
  }
  return runs.map(([from, to]) => (from === to ? String(from) : `${from}-${to}`)).join(',');
}

function cellOf(rect, x, y) {
  const u = (y - rect.min[1]) / (rect.max[1] - rect.min[1]);
  const v = 1 - (x - rect.min[0]) / (rect.max[0] - rect.min[0]);
  const column = Math.min(GRID - 1, Math.max(0, Math.floor(u * GRID)));
  const row = Math.min(GRID - 1, Math.max(0, Math.floor(v * GRID)));
  return row * GRID + column;
}

function cellsByMap(maps, points) {
  const found = new Map();
  for (const point of points) {
    const id = mapAt(maps, point[0], point[1]);
    if (!id) throw new Error(`habitat point ${point[0]}, ${point[1]} is outside every map`);
    if (!found.has(id)) found.set(id, new Set());
    found.get(id).add(
      cellOf(
        maps.find((map) => map.id === id),
        point[0],
        point[1]
      )
    );
  }
  return found;
}

function periods(row) {
  return {
    day: row.dayTimeLocations?.locations ?? [],
    night: row.nightTimeLocations?.locations ?? []
  };
}

function distribution(game, species, map) {
  const table = game.dataTable(TABLES.paldexDistribution);
  const points = { plain: new Map(), alpha: new Map() };
  for (const [rowName, row] of table.rows) {
    const entry = species.entryForCharacter(rowName);
    if (!entry) continue;
    const { day, night } = periods(row);
    if (day.length === 0 && night.length === 0) continue;
    const target = ALPHA_ROW.test(rowName) ? points.alpha : points.plain;
    const known = target.get(entry.id) ?? { day: [], night: [] };
    known.day.push(...day);
    known.night.push(...night);
    target.set(entry.id, known);
  }
  const cells = (found) =>
    new Map(
      [...found].map(([id, { day, night }]) => [
        id,
        { day: cellsByMap(map.maps, day), night: cellsByMap(map.maps, night) }
      ])
    );
  return { plain: cells(points.plain), alpha: cells(points.alpha) };
}

function mapsOf(cells) {
  const maps = {};
  const ids = [...new Set([...cells.day.keys(), ...cells.night.keys()])].sort(compareText);
  for (const id of ids) {
    const day = cells.day.get(id) ?? new Set();
    const night = cells.night.get(id) ?? new Set();
    const both = [...day].filter((cell) => night.has(cell));
    maps[id] = {
      both: encodeRanges(both),
      day: encodeRanges([...day].filter((cell) => !night.has(cell))),
      night: encodeRanges([...night].filter((cell) => !day.has(cell)))
    };
  }
  return maps;
}

function wildLevels(game, species) {
  const placements = game.dataTable(TABLES.spawnerPlacements);
  const placed = new Set();
  for (const row of placements.rows.values()) placed.add(row.SpawnerName);
  const levels = new Map();
  for (const row of game.dataTable(TABLES.wildSpawners).rows.values()) {
    if (!placed.has(row.SpawnerName)) continue;
    for (const slot of [1, 2, 3]) {
      const characterId = row[`Pal_${slot}`];
      if (!characterId || characterId === 'None' || characterId.startsWith(ALPHA_PREFIX)) continue;
      const entry = species.entryForCharacter(characterId);
      if (!entry) continue;
      const low = row[`LvMin_${slot}`];
      const high = row[`LvMax_${slot}`];
      if (!(low > 0) || !(high >= low)) continue;
      const known = levels.get(entry.id) ?? [low, high];
      levels.set(entry.id, [Math.min(known[0], low), Math.max(known[1], high)]);
    }
  }
  return levels;
}

function tagged(species, characterIds) {
  const ids = new Set();
  for (const characterId of characterIds) {
    const entry = species.entryForCharacter(characterId);
    if (entry) ids.add(entry.id);
  }
  return ids;
}

function fished(game, species) {
  const ponds = [...game.dataTable(TABLES.fishPonds).rows.values()].map((row) =>
    need(row.CharacterId, 'fish pond CharacterId')
  );
  const shadows = game.dataTable(TABLES.fishShadows);
  const spots = [...game.dataTable(TABLES.fishingSpots).rows.values()].map((row) => {
    const shadow = need(shadows.row(row.FishShadowId), `fish shadow ${row.FishShadowId}`);
    return need(shadow.PalId, `fish shadow ${row.FishShadowId} PalId`);
  });
  return tagged(species, [...ponds, ...spots]);
}

function caged(game, species) {
  return tagged(
    species,
    [...game.dataTable(TABLES.cagedPals).rows.values()].map((row) => need(row.PalID, 'cage PalID'))
  );
}

function raidEggs(game, species) {
  const ids = [];
  for (const row of game.dataTable(TABLES.raidBosses).rows.values()) {
    for (const [handle] of row.EggPalIDAndWeight ?? []) ids.push(need(handle.Key, 'raid egg Pal'));
  }
  return tagged(species, ids);
}

function bred(game, species) {
  const ids = [];
  for (const row of game.dataTable(TABLES.uniqueCombinations).rows.values()) {
    if (enumValue(row.ParentTribeA) === enumValue(row.ParentTribeB)) continue;
    ids.push(need(row.ChildCharacterID, 'unique combination child'));
  }
  return tagged(species, ids);
}

function wildEggs(world, eggSpawners, species) {
  const ids = [];
  for (const { level, index } of eggSpawners) {
    for (const lot of world.properties(level, index).SpawnPalEggLotteryDataArray ?? []) {
      const key = lot.PalEggData?.PalMonsterId?.Key;
      if (key && key !== 'None') ids.push(key);
    }
  }
  return tagged(species, ids);
}

export function buildHabitats(game, world, eggSpawners, species, map, landmarks, gameVersion) {
  const { plain, alpha } = distribution(game, species, map);
  const levels = wildLevels(game, species);
  const ways = {
    boss: new Set(
      landmarks.boss_markers
        .filter((marker) => marker.kind === 'field_boss' && marker.species)
        .map((marker) => marker.species)
    ),
    egg: wildEggs(world, eggSpawners, species),
    fished: fished(game, species),
    caged: caged(game, species),
    raid: raidEggs(game, species),
    bred: bred(game, species)
  };
  const entries = species.entries.map((entry) => {
    const cells = plain.get(entry.id) ?? alpha.get(entry.id) ?? null;
    const found = [];
    if (plain.has(entry.id)) found.push('wild');
    else if (alpha.has(entry.id)) found.push('alpha');
    for (const way of WAYS) {
      if (ways[way]?.has(entry.id)) found.push(way);
    }
    return {
      id: entry.id,
      ways: found,
      levels: levels.get(entry.id) ?? null,
      maps: cells ? mapsOf(cells) : {}
    };
  });
  return {
    game_version: gameVersion,
    sources: [
      TABLES.paldexDistribution,
      TABLES.wildSpawners,
      TABLES.spawnerPlacements,
      TABLES.fishPonds,
      TABLES.fishShadows,
      TABLES.fishingSpots,
      TABLES.cagedPals,
      TABLES.raidBosses,
      TABLES.uniqueCombinations,
      TABLES.bossMarkers,
      '/Game/Pal/Maps/MainWorld_5/PL_MainWorld5 bp_palmapobjectspawner_palegg actors'
    ],
    grid: GRID,
    ways: WAYS,
    species: entries
  };
}
