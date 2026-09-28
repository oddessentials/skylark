import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { displayAt, mapAt } from './lib/facts/coordinates.mjs';
import { pointInPolygon } from './lib/geometry.mjs';

const GAME_VERSION = '1.0.5.102999';
const FILES = [
  'pals.json',
  'elements.json',
  'map.json',
  'regions.json',
  'landmarks.json',
  'bosses.json',
  'names.json'
];
const worldDirectory = new URL('../../web/src/lib/world/', import.meta.url);
const world = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(new URL(name, worldDirectory), 'utf8'))])
);
const pals = world['pals.json'];
const map = world['map.json'];
const regions = world['regions.json'];
const landmarks = world['landmarks.json'];
const bosses = world['bosses.json'];
const names = world['names.json'];

function regionAt(x, y) {
  let best = null;
  for (const region of regions.regions) {
    for (const shape of region.shapes) {
      const inside =
        shape.type === 'box'
          ? pointInPolygon([x, y], shape.footprint)
          : Math.hypot(x - shape.center[0], y - shape.center[1]) <= shape.radius;
      if (inside && (best === null || shape.area < best.area))
        best = { id: region.id, area: shape.area };
    }
  }
  return best?.id ?? null;
}

function allPlaces() {
  return [
    ...landmarks.fast_travel,
    ...landmarks.watchtowers,
    ...landmarks.start_points,
    ...landmarks.towers,
    ...landmarks.dungeons.fixed,
    ...landmarks.dungeons.random,
    ...landmarks.boss_markers
  ];
}

test('every file records the game version it was read from', () => {
  for (const name of FILES) assert.equal(world[name].game_version, GAME_VERSION, name);
});

test('the Palpedia has 288 unique entries numbered 1 to 204', () => {
  const entries = pals.pals;
  assert.equal(entries.length, 288);
  assert.equal(new Set(entries.map((entry) => `${entry.number}${entry.suffix}`)).size, 288);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 288);
  const numbers = new Set(entries.map((entry) => entry.number));
  for (let number = 1; number <= 204; number++) assert.ok(numbers.has(number), `#${number}`);
  assert.equal(Math.max(...numbers), 204);
  assert.deepEqual([...new Set(entries.map((entry) => entry.suffix))].sort(), ['', 'B']);
  assert.equal(entries.filter((entry) => entry.suffix === 'B').length, 84);
});

test('287 Pals can be caught, matching the count in the 1.0 changelog', () => {
  const uncapturable = pals.pals.filter((entry) => entry.uncapturable);
  assert.deepEqual(
    uncapturable.map((entry) => `${entry.number} ${entry.name}`),
    ['204 Astralym']
  );
  assert.equal(pals.pals.length - uncapturable.length, 287);
});

test('known Palpedia entries carry the right names, elements and numbers', () => {
  const byId = new Map(pals.pals.map((entry) => [entry.id, entry]));
  const expected = [
    ['SheepBall', 1, '', 'Lamball', ['Normal']],
    ['PinkCat', 2, '', 'Cattiva', ['Normal']],
    ['ChickenPal', 3, '', 'Chikipi', ['Normal']],
    ['BluePlatypus_Fire', 5, 'B', 'Fuack Ignis', ['Water', 'Fire']],
    ['Kitsunebi', 29, '', 'Foxparks', ['Fire']],
    ['ElecPanda', 185, '', 'Grizzbolt', ['Electricity']],
    ['JetDragon', 202, '', 'Jetragon', ['Dragon']],
    ['WorldTreeDragon', 204, '', 'Astralym', []]
  ];
  for (const [id, number, suffix, name, elements] of expected) {
    const entry = byId.get(id);
    assert.ok(entry, id);
    assert.equal(entry.number, number, id);
    assert.equal(entry.suffix, suffix, id);
    assert.equal(entry.name, name, id);
    assert.deepEqual(entry.elements, elements, id);
  }
  const workIds = new Set(pals.work_suitabilities.map((work) => work.id));
  assert.equal(workIds.size, 13);
  for (const entry of pals.pals) {
    for (const [id, level] of Object.entries(entry.work)) {
      assert.ok(workIds.has(id), `${entry.id} ${id}`);
      assert.ok(level >= 1 && level <= 10, `${entry.id} ${id} ${level}`);
    }
  }
});

test('live actor classes resolve to species and English names', () => {
  const expected = {
    BP_PinkCat_C: ['PinkCat', 'Cattiva'],
    BP_SheepBall_C: ['SheepBall', 'Lamball'],
    BP_ChickenPal_C: ['ChickenPal', 'Chikipi'],
    BP_Ganesha_C: ['Ganesha', 'Teafant'],
    BP_BerryGoat_C: ['BerryGoat', 'Caprity'],
    BP_SheepBall_BOSS_C: ['SheepBall', 'Lamball'],
    BP_ElecPanda_Gym_C: ['ElecPanda', 'Grizzbolt'],
    BP_NightLady_RAID_C: ['NightLady', 'Bellanoir']
  };
  for (const [className, [species, name]] of Object.entries(expected)) {
    const record = pals.classes[className];
    assert.ok(record, className);
    assert.equal(record.species, species, className);
    assert.equal(record.name, name, className);
  }
  assert.deepEqual(pals.classes.BP_SheepBall_BOSS_C.roles, ['alpha']);
  const ids = new Set(pals.pals.map((entry) => entry.id));
  const withNormalClass = new Set();
  for (const [className, record] of Object.entries(pals.classes)) {
    assert.match(className, /^BP_.+_C$/);
    if (record.species !== null) assert.ok(ids.has(record.species), className);
    if (record.roles.includes('normal')) withNormalClass.add(record.species);
  }
  for (const id of ids) assert.ok(withNormalClass.has(id), `${id} has no live actor class`);
});

test('elements carry English names and colours', () => {
  const elements = world['elements.json'].elements;
  assert.deepEqual(
    elements.map((element) => element.id),
    ['Normal', 'Fire', 'Water', 'Leaf', 'Electricity', 'Ice', 'Earth', 'Dark', 'Dragon']
  );
  const names = Object.fromEntries(elements.map((element) => [element.id, element.name]));
  assert.equal(names.Normal, 'Neutral');
  assert.equal(names.Leaf, 'Grass');
  assert.equal(names.Electricity, 'Electric');
  assert.equal(names.Earth, 'Ground');
  for (const element of elements) assert.match(element.color, /^#[0-9a-f]{6}$/);
  const used = new Set(pals.pals.flatMap((entry) => entry.elements));
  for (const id of used) assert.ok(names[id], id);
});

test('the map rectangles and transforms match the game', () => {
  const byId = Object.fromEntries(map.maps.map((entry) => [entry.id, entry]));
  assert.deepEqual(byId.MainMap.min, [-1099400, -724400]);
  assert.deepEqual(byId.MainMap.max, [349400, 724400]);
  assert.deepEqual(byId.Tree.min, [347351.5, -818197]);
  assert.deepEqual(byId.Tree.max, [689148.5, -476400]);
  assert.ok(byId.Tree.priority > byId.MainMap.priority);
  assert.deepEqual(map.image.u, { axis: 'y', invert: false });
  assert.deepEqual(map.image.v, { axis: 'x', invert: true });
  assert.equal(map.display.x.axis, 'y');
  assert.equal(map.display.x.origin, 158000);
  assert.equal(map.display.x.scale, 459);
  assert.equal(map.display.y.axis, 'x');
  assert.equal(map.display.y.origin, -123888);
  assert.equal(map.display.y.scale, 459);
  assert.deepEqual(displayAt(map.display, -123888, 158000), [0, 0]);
  assert.deepEqual(displayAt(map.display, -123888 + 459 * 10, 158000 - 459 * 5), [-5, 10]);
});

test('known coordinates fall inside the map rectangles', () => {
  const byId = Object.fromEntries(map.maps.map((entry) => [entry.id, entry]));
  for (const place of allPlaces()) {
    const [x, y] = place.position;
    const id = mapAt(map.maps, x, y);
    assert.ok(id, `${place.id ?? place.spawner ?? place.boss_type} at ${x}, ${y}`);
    assert.equal(place.map, id);
    const rectangle = byId[id];
    assert.ok(x >= rectangle.min[0] && x <= rectangle.max[0]);
    assert.ok(y >= rectangle.min[1] && y <= rectangle.max[1]);
    assert.deepEqual(place.display, displayAt(map.display, x, y));
  }
  const towers = Object.fromEntries(landmarks.towers.map((tower) => [tower.boss_type, tower]));
  assert.equal(towers.GrassBoss.map, 'MainMap');
  assert.equal(towers.WorldTreeBoss.map, 'Tree');
});

test('regions carry names and shapes, and towers sit in their tower regions', () => {
  assert.equal(regions.regions.length, 123);
  for (const region of regions.regions) {
    assert.ok(region.name, region.id);
    assert.ok(region.shapes.length > 0, region.id);
  }
  const towers = Object.fromEntries(landmarks.towers.map((tower) => [tower.boss_type, tower]));
  const expected = {
    GrassBoss: 'Tower_Grass',
    ForestBoss: 'Tower_Forest',
    ElectricBoss: 'Tower_Volcano',
    DesertBoss: 'Tower_Desert',
    SnowBoss: 'Tower_Snowy',
    SakurajimaBoss: 'Tower_Sakurajima',
    VikingBoss: 'Darkisland_Boss',
    KingWhaleBoss: 'Boss_KingWhale'
  };
  for (const [bossType, regionId] of Object.entries(expected)) {
    const [x, y] = towers[bossType].position;
    assert.equal(regionAt(x, y), regionId, bossType);
  }
});

test('landmarks match the counts read from the game', () => {
  assert.equal(landmarks.fast_travel.length, 152);
  assert.equal(new Set(landmarks.fast_travel.map((point) => point.id)).size, 152);
  for (const point of landmarks.fast_travel) assert.ok(point.name, point.id);
  assert.equal(landmarks.watchtowers.length, 22);
  assert.equal(landmarks.start_points.length, 8);
  assert.equal(landmarks.towers.length, 13);
  assert.equal(landmarks.dungeons.fixed.length, 18);
  for (const dungeon of landmarks.dungeons.fixed) assert.ok(dungeon.name, dungeon.id);
  assert.equal(landmarks.dungeons.random.length, 170);
  const kinds = {};
  for (const marker of landmarks.boss_markers) kinds[marker.kind] = (kinds[marker.kind] ?? 0) + 1;
  assert.deepEqual(kinds, { field_boss: 90, oil_rig: 3, wanted: 33 });
  const species = new Set(pals.pals.map((entry) => entry.id));
  for (const marker of landmarks.boss_markers) {
    assert.ok(marker.name, marker.spawner);
    if (marker.kind === 'field_boss') assert.ok(species.has(marker.species), marker.character);
  }
});

test('boss battles expose the save keys for every tower and difficulty', () => {
  const factionTowers = bosses.battles.filter((battle) => battle.category === 'faction_tower');
  assert.deepEqual(factionTowers.map((battle) => battle.boss_type).sort(), [
    'DesertBoss',
    'ElectricBoss',
    'ForestBoss',
    'GrassBoss',
    'SakurajimaBoss',
    'SnowBoss',
    'SorajimaBoss',
    'VikingBoss'
  ]);
  for (const battle of factionTowers) {
    assert.deepEqual(
      battle.difficulties.map((entry) => entry.defeat_flag_key),
      [`${battle.boss_type}_Normal`, `${battle.boss_type}_Hard`]
    );
    assert.ok(battle.tower, battle.boss_type);
  }
  const byType = Object.fromEntries(bosses.battles.map((battle) => [battle.boss_type, battle]));
  assert.equal(byType.GrassBoss.difficulties[0].name, 'Zoe & Grizzbolt');
  assert.equal(byType.GrassBoss.difficulties[0].species, 'ElecPanda');
  assert.equal(byType.WorldTreeBoss.category, 'world_tree_final');
  assert.equal(byType.WorldTreeBoss.difficulties[1].unlock_condition, 'DefeatSameBossNormal');
  assert.equal(byType.KingWhaleBoss.category, 'king_whale');
  assert.equal(byType.KingWhaleBoss.difficulties[0].species_name, 'Panthalus');
  assert.equal(bosses.hard_unlock_trigger, 'SorajimaBoss');
  assert.equal(bosses.raids.length, 11);
  assert.deepEqual([...new Set(bosses.raids.map((raid) => raid.name))].sort(), [
    'Bellanoir',
    'Bellanoir Libero',
    'Blazamut Ryu',
    'Hartalis',
    'Moon Lord',
    'Xenolord'
  ]);
});

test('technologies, buildable structures and human characters carry English names', () => {
  assert.equal(names.technologies.length, 588);
  assert.equal(names.structures.length, 506);
  const technology = new Map(names.technologies.map((entry) => [entry.id, entry.name]));
  assert.equal(technology.get('RepairBench'), 'Repair Bench');
  assert.equal(technology.get('Workbench'), 'Primitive Workbench');
  assert.equal(technology.get('Product_Axe_Grade_01'), 'Stone Axe');
  assert.equal(technology.get('GrapplingGun'), 'Grappling Gun');
  const structure = new Map(names.structures.map((entry) => [entry.id, entry.name]));
  assert.equal(structure.get('RepairBench'), 'Repair Bench');
  assert.equal(structure.get('PalBoxV2'), 'Palbox');
  const human = new Map(names.humans.map((entry) => [entry.id, entry.name]));
  assert.ok(names.humans.length > 50);
  assert.ok(human.get('Hunter_Rifle'));
  for (const entry of [...names.technologies, ...names.structures, ...names.humans]) {
    assert.doesNotMatch(entry.name, /[<>|]|^en Text$/, entry.id);
  }
});
