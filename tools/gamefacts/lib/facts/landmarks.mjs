import { enumValue, need } from '../game.mjs';
import { compareText, roundAll } from '../output.mjs';
import { displayAt, mapAt } from './coordinates.mjs';
import { TABLES, TEXTS } from './sources.mjs';

function place(world, level, index, map) {
  const position = roundAll(world.actorTransform(level, index).translation);
  return {
    position,
    map: mapAt(map.maps, position[0], position[1]),
    display: displayAt(map.display, position[0], position[1])
  };
}

function byId(a, b) {
  return compareText(a.id, b.id);
}

function byPosition(a, b) {
  return a.position[0] - b.position[0] || a.position[1] - b.position[1];
}

export function buildLandmarks(game, world, actors, species, map, gameVersion) {
  const respawnText = (key) => game.lookupText([TEXTS.respawnPoints], key);

  const fastTravel = actors.fastTravel
    .map(({ level, index }) => {
      const id = need(world.properties(level, index).FastTravelPointID, 'FastTravelPointID');
      return { id, name: respawnText(id), ...place(world, level, index, map) };
    })
    .sort(byId);

  const watchtowers = actors.watchtowers
    .map(({ level, index }) => {
      const id = need(world.properties(level, index).FastTravelPointID, 'FastTravelPointID');
      return { id, name: respawnText(id), ...place(world, level, index, map) };
    })
    .sort(byId);

  const startPoints = actors.startPoints
    .map(({ level, index }) => {
      const id = need(world.properties(level, index).RespawnPointID, 'RespawnPointID');
      return { id, name: respawnText(`${id}_Title`), ...place(world, level, index, map) };
    })
    .sort(byId);

  const towers = actors.towers
    .map(({ level, index, className }) => {
      const bossType = enumValue(
        need(world.properties(level, index).BossType, `${className} BossType`)
      );
      return {
        boss_type: bossType,
        class: className,
        name: game.lookupText([TEXTS.ui], `BOSS_BATTLE_NAME_${bossType}`),
        ...place(world, level, index, map)
      };
    })
    .sort((a, b) => compareText(a.boss_type, b.boss_type));

  const spawnAreas = game.dataTable(TABLES.dungeonSpawnAreas);
  const dungeonName = (key) => game.lookupText([TEXTS.dungeonNames], key);
  const randomDungeons = actors.dungeonMarkers
    .map(({ level, index, className }) => {
      const areaIds = (world.properties(level, index).SpawnAreaIds ?? []).map((handle) =>
        need(handle.Key, `${className} SpawnAreaIds`)
      );
      const names = [
        ...new Set(areaIds.map((areaId) => dungeonName(spawnAreas.row(areaId)?.DungeonNameTextId)))
      ];
      return {
        spawn_areas: areaIds,
        name: names.length === 1 ? names[0] : null,
        ...place(world, level, index, map)
      };
    })
    .sort(byPosition);

  const fixedDungeons = actors.dungeonEntrances
    .map(({ level, index, className }) => {
      const key = need(
        world.properties(level, index).DungeonNameRowHandle?.RowName,
        `${className} DungeonNameRowHandle`
      );
      return { id: key, name: dungeonName(key), ...place(world, level, index, map) };
    })
    .sort(byId);

  const markers = game.dataTable(TABLES.bossMarkers);
  const merged = new Map();
  for (const [rowName, row] of markers.rows) {
    const spawner = need(row.SpawnerID, `${rowName}.SpawnerID`);
    const characterId = row.CharacterID;
    const position = roundAll(need(row.Location, `${rowName}.Location`));
    let marker;
    if (characterId && characterId !== 'None') {
      const entry = species.entryForCharacter(characterId);
      marker = {
        kind: 'field_boss',
        spawner,
        character: characterId,
        species: entry ? entry.id : null,
        name: species.palName(characterId),
        title: species.title(characterId)
      };
    } else if (species.humans.row(spawner)) {
      marker = {
        kind: 'wanted',
        spawner,
        character: species.humans.rowName(spawner),
        species: null,
        name: species.humanName(spawner),
        title: species.title(spawner)
      };
    } else {
      marker = {
        kind: 'oil_rig',
        spawner,
        character: null,
        species: null,
        name: game.lookupText([TEXTS.worldMap], spawner),
        title: null
      };
    }
    Object.assign(marker, {
      level: row.Level,
      position,
      map: mapAt(map.maps, position[0], position[1]),
      display: displayAt(map.display, position[0], position[1])
    });
    const key = JSON.stringify(marker);
    if (merged.has(key)) merged.get(key).rows.push(rowName);
    else merged.set(key, { ...marker, rows: [rowName] });
  }
  const bossMarkers = [...merged.values()];
  bossMarkers.sort(
    (a, b) => compareText(a.kind, b.kind) || compareText(a.spawner, b.spawner) || byPosition(a, b)
  );

  const label = (key) => game.lookupText([TEXTS.ui], key);
  return {
    game_version: gameVersion,
    sources: [
      '/Game/Pal/Maps/MainWorld_5/PL_MainWorld5 and its World Partition cells',
      TABLES.bossMarkers,
      TABLES.dungeonSpawnAreas,
      TEXTS.respawnPoints,
      TEXTS.dungeonNames,
      TEXTS.ui
    ],
    kinds: {
      fast_travel: label('MAP_FILTER_FT'),
      tower: label('MAP_FILTER_BOSSTOWER'),
      field_boss: label('MAP_FILTER_BOSS'),
      wanted: label('MAP_FILTER_HUMANBOSS'),
      oil_rig: label('MAP_FILTER_OILRIG')
    },
    fast_travel: fastTravel,
    watchtowers,
    start_points: startPoints,
    towers,
    dungeons: { fixed: fixedDungeons, random: randomDungeons },
    boss_markers: bossMarkers
  };
}
