import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  eggSizeOf,
  FALLBACK_CHILD,
  MAX_RANK_BONUS,
  MEAN_OFFSET,
  RUNTIME
} from './lib/facts/breeding.mjs';
import { displayAt, mapAt } from './lib/facts/coordinates.mjs';
import { saveKeyOf } from './lib/facts/landmarks.mjs';
import { GRID, WAYS, encodeRanges } from './lib/facts/habitats.mjs';
import { pointInPolygon } from './lib/geometry.mjs';
import { pngSize } from './lib/png.mjs';

const GAME_VERSION = '1.0.5.102999';
const FILES = [
  'pals.json',
  'elements.json',
  'map.json',
  'regions.json',
  'landmarks.json',
  'bosses.json',
  'names.json',
  'habitats.json',
  'breeding.json',
  'icons.json',
  'technology.json',
  'exp.json',
  'lab.json',
  'quests.json'
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
const habitats = world['habitats.json'];
const breeding = world['breeding.json'];
const icons = world['icons.json'];
const technology = world['technology.json'];
const exp = world['exp.json'];
const lab = world['lab.json'];
const quests = world['quests.json'];
const iconDirectory = new URL('../../web/static/pals/', import.meta.url);

function decodeRanges(text) {
  if (text === '') return [];
  return text.split(',').flatMap((part) => {
    const [from, to = from] = part.split('-').map(Number);
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  });
}

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

test('fast travel points carry the save key form of their instance ids', () => {
  assert.equal(saveKeyOf('323d4bf9f2288044b113e54c94cc2a30'), 'F94B3D32448028F24CE513B1302ACC94');
  assert.throws(() => saveKeyOf('nope'));
  const points = [...landmarks.fast_travel, ...landmarks.watchtowers];
  for (const point of points) assert.match(point.guid, /^[0-9A-F]{32}$/, point.id);
  assert.equal(new Set(points.map((point) => point.guid)).size, points.length);
  const seventh = landmarks.fast_travel.find((point) => point.id === 'FTPoint7');
  assert.equal(seventh.guid, '01ACCA6E4BDAA68220821FB05AB54E4D');
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

test('habitat cells round-trip through the range encoding', () => {
  assert.equal(encodeRanges([]), '');
  assert.equal(encodeRanges([5, 3, 4, 9, 4]), '3-5,9');
  assert.deepEqual(decodeRanges('3-5,9'), [3, 4, 5, 9]);
});

test('every Palpedia entry has a habitat record in Palpedia order', () => {
  assert.equal(habitats.grid, GRID);
  assert.deepEqual(habitats.ways, WAYS);
  assert.deepEqual(
    habitats.species.map((entry) => entry.id),
    pals.pals.map((entry) => entry.id)
  );
  const ranges = /^(\d+(-\d+)?)(,\d+(-\d+)?)*$/;
  for (const entry of habitats.species) {
    for (const way of entry.ways) assert.ok(WAYS.includes(way), `${entry.id} ${way}`);
    assert.ok(!(entry.ways.includes('wild') && entry.ways.includes('alpha')), entry.id);
    if (entry.levels) assert.ok(entry.levels[0] >= 1 && entry.levels[1] >= entry.levels[0]);
    for (const [mapId, cells] of Object.entries(entry.maps)) {
      assert.ok(
        map.maps.some((rect) => rect.id === mapId),
        `${entry.id} ${mapId}`
      );
      const seen = new Set();
      for (const period of ['both', 'day', 'night']) {
        assert.ok(cells[period] === '' || ranges.test(cells[period]), `${entry.id} ${period}`);
        for (const cell of decodeRanges(cells[period])) {
          assert.ok(cell >= 0 && cell < GRID * GRID, `${entry.id} cell ${cell}`);
          assert.ok(!seen.has(cell), `${entry.id} cell ${cell} in two periods`);
          seen.add(cell);
        }
      }
      assert.ok(seen.size > 0, `${entry.id} ${mapId} has no cells`);
    }
    if (entry.ways.includes('wild') || entry.ways.includes('alpha')) {
      assert.ok(Object.keys(entry.maps).length > 0, `${entry.id} has no map`);
    } else {
      assert.deepEqual(entry.maps, {}, entry.id);
    }
  }
});

test('habitats match the counts read from the game', () => {
  const counts = {};
  for (const entry of habitats.species) {
    for (const way of entry.ways) counts[way] = (counts[way] ?? 0) + 1;
  }
  assert.deepEqual(counts, {
    wild: 258,
    alpha: 16,
    boss: 89,
    egg: 237,
    fished: 40,
    caged: 86,
    raid: 5,
    bred: 81
  });
  const nightOnly = habitats.species.filter((entry) => {
    const maps = Object.values(entry.maps);
    return maps.length > 0 && maps.every((cells) => cells.both === '' && cells.day === '');
  });
  assert.equal(nightOnly.length, 12);
  assert.ok(nightOnly.some((entry) => entry.id === 'NightFox'));
  assert.equal(habitats.species.filter((entry) => entry.maps.Tree).length, 45);
  assert.equal(habitats.species.filter((entry) => entry.levels).length, 263);
  assert.deepEqual(
    habitats.species.filter((entry) => entry.ways.length === 0).map((entry) => entry.id),
    ['WhiteAlienDragon', 'Mothman', 'FlowerPrince', 'KingWhale', 'WorldTreeDragon']
  );
  const lamball = habitats.species.find((entry) => entry.id === 'SheepBall');
  assert.deepEqual(lamball.ways, ['wild', 'egg', 'caged']);
  assert.deepEqual(lamball.levels, [1, 9]);
  assert.ok(decodeRanges(lamball.maps.MainMap.both).length > 50);
  const bellanoir = habitats.species.find((entry) => entry.id === 'NightLady');
  assert.deepEqual(bellanoir.ways, ['raid', 'bred']);
  const bosses = new Set(
    landmarks.boss_markers.filter((marker) => marker.kind === 'field_boss').map((m) => m.species)
  );
  for (const entry of habitats.species) {
    assert.equal(entry.ways.includes('boss'), bosses.has(entry.id), entry.id);
  }
});

function nearestChild(target) {
  let best = Number.POSITIVE_INFINITY;
  let candidates = [];
  for (const entry of breeding.species) {
    if (!entry.in_pool) continue;
    const distance = Math.abs(entry.rank - target);
    if (distance < best) {
      best = distance;
      candidates = [entry];
    } else if (distance === best) candidates.push(entry);
  }
  return candidates.reduce((winner, entry) => (entry.priority > winner.priority ? entry : winner));
}

test('breeding species follow the Palpedia and the pool follows the native filters', () => {
  assert.deepEqual(
    breeding.species.map((entry) => entry.id),
    pals.pals.map((entry) => entry.id)
  );
  const pool = breeding.species.filter((entry) => entry.in_pool);
  assert.equal(pool.length, 183);
  assert.equal(breeding.species.filter((entry) => entry.ignore_combi).length, 28);
  const children = new Set(breeding.unique.map((row) => row.child.toLowerCase()));
  for (const entry of breeding.species) {
    assert.ok(entry.rank >= 10 && entry.rank <= 3080, `${entry.id} rank ${entry.rank}`);
    assert.ok(entry.male_probability >= 0 && entry.male_probability <= 100, entry.id);
    if (entry.in_pool) {
      assert.ok(!entry.ignore_combi, entry.id);
      assert.ok(!children.has(entry.id.toLowerCase()), `${entry.id} is a unique child`);
      assert.equal(entry.priority, entry.rank * 100, entry.id);
    } else {
      assert.ok(entry.ignore_combi || children.has(entry.id.toLowerCase()), entry.id);
    }
  }
  assert.equal(new Set(pool.map((entry) => entry.rank)).size, pool.length);
  assert.equal(new Set(breeding.species.map((entry) => entry.rank)).size, 288);
  assert.equal(breeding.child_rule.fallback, FALLBACK_CHILD);
  assert.equal(breeding.child_rule.mean_offset, MEAN_OFFSET);
  assert.equal(breeding.child_rule.max_rank_bonus, MAX_RANK_BONUS);
});

test('the 258 unique rows name Palpedia entries or unreleased tribes', () => {
  assert.equal(breeding.unique.length, 258);
  const ids = new Set(breeding.species.map((entry) => entry.id));
  const selfRows = breeding.unique.filter((row) => row.parent_a === row.parent_b);
  assert.equal(selfRows.filter((row) => ids.has(row.child)).length, 104);
  for (const row of selfRows) assert.equal(row.child, row.parent_a);
  const gendered = breeding.unique.filter((row) => row.gender_a || row.gender_b);
  assert.equal(gendered.length, 2);
  for (const row of gendered) assert.ok(ids.has(row.parent_a) && ids.has(row.parent_b), row.child);
  const catMage = breeding.unique.find(
    (row) => row.parent_a === 'CatMage' && row.parent_b === 'FoxMage' && row.gender_a === 'male'
  );
  assert.deepEqual(catMage, {
    parent_a: 'CatMage',
    gender_a: 'male',
    parent_b: 'FoxMage',
    gender_b: 'female',
    child: 'FoxMage_Dark'
  });
  assert.ok(
    breeding.unique.some(
      (row) =>
        row.parent_a === 'LazyDragon' &&
        row.parent_b === 'ElecCat' &&
        row.child === 'LazyDragon_Electric'
    )
  );
  const unreleased = breeding.unique.filter((row) => !ids.has(row.child));
  assert.ok(unreleased.length > 0);
  for (const row of unreleased)
    assert.ok(!ids.has(row.parent_a) || !ids.has(row.parent_b), row.child);
});

test('the child rule reproduces the samples read from the game', () => {
  const rank = new Map(breeding.species.map((entry) => [entry.id, entry.rank]));
  const mean = (a, b) => (rank.get(a) + rank.get(b)) / 2;
  assert.equal(nearestChild(mean('ChickenPal', 'Boar')).id, 'BluePlatypus');
  assert.equal(mean('SheepBall', 'Anubis'), 1765);
  assert.equal(nearestChild(1765).id, 'HoodGhost');
  assert.equal(nearestChild(mean('SheepBall', 'SheepBall')).id, 'SheepBall');
});

test('inheritance counts, cakes and mutation constants carry what the game and the probe gave', () => {
  assert.deepEqual(breeding.inheritance.talent_num, [3, 2, 1]);
  assert.deepEqual(breeding.inheritance.passive_num, [4, 3, 2, 1]);
  assert.deepEqual(breeding.inheritance.passive_random_add_num, [4, 3, 2, 1]);
  assert.equal(breeding.inheritance.boss_rate, 0.05);
  assert.deepEqual(breeding.inheritance.mutation, RUNTIME.mutation);
  assert.deepEqual(
    breeding.cakes.map((cake) => cake.id),
    ['Cake', 'Cake02', 'Cake03', 'Cake04', 'Cake05']
  );
  const byId = Object.fromEntries(breeding.cakes.map((cake) => [cake.id, cake]));
  assert.equal(byId.Cake02.name, 'Mushroom Cake');
  assert.deepEqual(byId.Cake02.talent_bonus, [1, 5]);
  assert.equal(byId.Cake03.breed_count, 2);
  assert.equal(byId.Cake04.mutation_rate_bonus_percent, 2);
  assert.equal(byId.Cake05.inherit_all_active_skills, true);
  assert.equal(byId.Cake05.passive_inherit_count_override, 4);
  for (const cake of breeding.cakes) assert.equal(cake.rank_bonus, 0, cake.id);
});

test('passives carry English names and the random-add pool of 85', () => {
  assert.equal(breeding.passives.length, 420);
  assert.equal(breeding.passives.filter((row) => row.random_add).length, 85);
  const byId = Object.fromEntries(breeding.passives.map((row) => [row.id, row]));
  assert.deepEqual(byId.Rare, {
    id: 'Rare',
    name: 'Lucky',
    rank: 4,
    random_add: false,
    weight: 100
  });
  assert.equal(byId.Legend.name, 'Legend');
  assert.equal(byId.PAL_Sanity_Down_2.name, 'Workaholic');
  for (const row of breeding.passives) assert.doesNotMatch(row.name, /[<>|]|^en Text$/, row.id);
});

test('eggs follow the element and the rarity tier, and the kinds are the 56 egg items', () => {
  assert.equal(breeding.eggs.kinds.length, 56);
  assert.deepEqual(
    breeding.eggs.sizes.map((size) => size.max_rarity),
    [2, 4, 6, 7, 99]
  );
  assert.equal(eggSizeOf(5, breeding.eggs.sizes), 3);
  assert.equal(eggSizeOf(8, breeding.eggs.sizes), 5);
  const kinds = new Map(breeding.eggs.kinds.map((kind) => [kind.id, kind]));
  assert.equal(kinds.get('PalEgg_Normal_01').name, 'Common Egg');
  assert.equal(kinds.get('PalEgg_Dragon_05').name, 'Huge Dragon Egg');
  const rarity = new Map(pals.pals.map((entry) => [entry.id, entry.rarity]));
  for (const entry of breeding.species) {
    assert.ok(kinds.has(entry.egg), `${entry.id} egg ${entry.egg}`);
    assert.equal(kinds.get(entry.egg).size, eggSizeOf(rarity.get(entry.id), breeding.eggs.sizes));
    if (entry.alpha_egg) assert.ok(kinds.has(entry.alpha_egg), entry.id);
  }
  const eggOf = Object.fromEntries(breeding.species.map((entry) => [entry.id, entry.egg]));
  assert.equal(eggOf.GrassMammoth, 'PalEgg_Leaf_05');
  assert.equal(eggOf.Boar, 'PalEgg_Earth_01');
  assert.equal(eggOf.KingBahamut, 'PalEgg_Fire_05');
  assert.equal(eggOf.CaptainPenguin, 'PalEgg_Water_03');
  assert.equal(eggOf.RaijinDaughter_Water, 'PalEgg_Dark_01');
  assert.equal(eggOf.Deer, 'PalEgg_Normal_03');
  assert.equal(breeding.species.find((entry) => entry.id === 'Deer').alpha_egg, 'PalEgg_Normal_04');
  assert.deepEqual(breeding.eggs.hatching_speed_by_temperature, {
    0: 2,
    1: 1.5,
    2: 1,
    3: 1,
    4: 0.75,
    5: 0.75,
    6: 0.75,
    7: 0.75,
    8: 0.75
  });
});

test('every Palpedia entry has a 64 pixel icon from the game', () => {
  assert.equal(icons.size, 64);
  assert.deepEqual(
    icons.species,
    pals.pals.map((entry) => entry.id)
  );
  const files = new Set(readdirSync(iconDirectory).filter((name) => name.endsWith('.png')));
  assert.equal(files.size, icons.species.length);
  for (const id of icons.species) {
    assert.ok(files.has(`${id}.png`), id);
    const size = pngSize(readFileSync(new URL(`${id}.png`, iconDirectory)));
    assert.deepEqual(size, { width: 64, height: 64 }, id);
  }
});

test('technologies carry levels, costs, prerequisites and what they unlock', () => {
  assert.equal(technology.technologies.length, 588);
  assert.equal(technology.level_cap, 80);
  assert.equal(technology.points_per_level, 6);
  assert.equal(technology.fast_travel_points, 1);
  assert.deepEqual(technology.default_unlocked, [
    'Workbench',
    'Product_Pickaxe_Grade_01',
    'Product_Axe_Grade_01',
    'HandTorch',
    'Battle_MeleeWeapon_Bat'
  ]);
  const byId = new Map(technology.technologies.map((entry) => [entry.id, entry]));
  const towers = new Set(bosses.battles.map((battle) => battle.boss_type));
  const research = new Set(lab.research.map((entry) => entry.id));
  let bossCount = 0;
  const levels = new Set();
  for (const entry of technology.technologies) {
    assert.ok(entry.name && !/[<>|]|^en Text$/.test(entry.name), entry.id);
    if (entry.description !== null) assert.doesNotMatch(entry.description, /[<>|]/, entry.id);
    assert.ok(entry.level >= 1 && entry.level <= technology.level_cap, entry.id);
    assert.ok(entry.cost >= 1 && entry.cost <= 9, entry.id);
    levels.add(entry.level);
    if (entry.boss) bossCount++;
    if (entry.requires.tower) assert.ok(towers.has(entry.requires.tower), entry.id);
    if (entry.requires.technology) assert.ok(byId.has(entry.requires.technology), entry.id);
    if (entry.requires.research) assert.ok(research.has(entry.requires.research), entry.id);
    assert.ok(entry.unlocks.length > 0, entry.id);
    assert.equal(entry.category.kind, entry.unlocks[0].kind);
    for (const unlock of entry.unlocks) {
      assert.ok(unlock.kind === 'build' || unlock.kind === 'item', entry.id);
      assert.ok(unlock.name, `${entry.id} ${unlock.id}`);
      if (unlock.type) assert.ok(technology.categories[unlock.kind][unlock.type], unlock.id);
    }
  }
  assert.equal(levels.size, 80);
  assert.equal(bossCount, 51);
  assert.equal(technology.technologies.filter((entry) => entry.requires.tower).length, 17);
  assert.equal(technology.technologies.filter((entry) => entry.requires.research).length, 10);
  assert.equal(byId.get('Workbench').level, 1);
  assert.equal(byId.get('Workbench').name, 'Primitive Workbench');
  assert.deepEqual(byId.get('Workbench').category, { kind: 'build', type: 'Product' });
  assert.equal(technology.categories.build.Product, 'Production');
  assert.equal(technology.categories.item.Essential, 'Key Items');
  assert.equal(byId.get('BreedFarm').requires.tower, 'ForestBoss');
  assert.equal(byId.get('MiningTool').requires.research, 'Mining5');
  assert.equal(byId.get('WingGlider').level, 80);
  assert.equal(byId.get('WingGlider').cost, 9);
  assert.equal(byId.get('WingGlider').boss, true);
  assert.match(
    byId.get('Workbench').description,
    /^Primitive Workbench for producing simple items/
  );
  assert.ok(technology.technologies.filter((entry) => entry.description).length > 500);
});

test('the exp table runs to the level cap', () => {
  assert.equal(exp.max_level, 80);
  assert.equal(exp.levels.length, 80);
  exp.levels.forEach((entry, index) => {
    assert.equal(entry.level, index + 1);
    if (index > 0) assert.ok(entry.total > exp.levels[index - 1].total, `level ${entry.level}`);
  });
  assert.equal(exp.levels[0].total, 0);
  assert.equal(exp.levels[49].total, 2378134);
  assert.equal(exp.levels[79].total, 45859908);
});

test('lab research carries English names, work, prerequisites and effects', () => {
  assert.equal(lab.research.length, 168);
  const byId = new Map(lab.research.map((entry) => [entry.id, entry]));
  const technologies = new Set(technology.technologies.map((entry) => entry.id));
  for (const entry of lab.research) {
    assert.ok(entry.name && !/[<>|]|^en Text$/.test(entry.name), entry.id);
    assert.ok(entry.required_work >= 5000, entry.id);
    if (entry.requires) assert.ok(byId.has(entry.requires), entry.id);
    assert.ok(entry.work.name, entry.id);
    for (const unlock of entry.unlocks) assert.ok(technologies.has(unlock), entry.id);
    assert.equal(entry.kind === 'TechnologyUnlock', entry.unlocks.length > 0, entry.id);
    assert.equal(entry.effect === null, entry.kind === 'TechnologyUnlock', entry.id);
  }
  assert.equal(lab.research.filter((entry) => entry.unlocks.length > 0).length, 10);
  assert.equal(lab.research.filter((entry) => entry.essential).length, 69);
  const first = byId.get('Handcraft1');
  assert.equal(first.name, 'Handiwork Speed 1');
  assert.deepEqual(first.work, { suitability: 'Handcraft', name: 'Handiwork' });
  assert.equal(first.required_work, 50000);
  assert.deepEqual(first.effect, {
    type: 'CraftSpeed',
    value: 10,
    work_suitability: 'Handcraft',
    item_type: null
  });
  assert.deepEqual(byId.get('Handcraft5').unlocks, ['ToolBoxV1']);
  assert.equal(byId.get('Handcraft5').effect_description, 'Unlock Technology: Large Toolbox');
  assert.equal(byId.get('Mining5').requires, 'Mining1_2');
});

test('the main quests carry titles and the story order the quest manager tracks', () => {
  assert.equal(quests.main.length, 57);
  assert.equal(quests.story, 31);
  assert.deepEqual(quests.initial, [
    'Main_UnlockFastTravel',
    'Hidden_ChangeWeaponBulletTutorialTrigger',
    'Hidden_WhaleWhistleTrigger'
  ]);
  const staged = quests.main.filter((quest) => quest.stage !== null);
  assert.equal(staged.length, 31);
  staged.forEach((quest, index) => assert.equal(quest.stage, index, quest.id));
  assert.equal(staged[0].id, 'Main_UnlockFastTravel');
  assert.equal(staged[0].title, 'Activate Great Eagle Statue');
  assert.equal(staged[30].id, 'Main_DefeatWorldTreeDragon');
  assert.equal(staged[30].title, 'Awakening');
  const byId = new Map(quests.main.map((quest) => [quest.id, quest]));
  assert.equal(byId.get('Main_DefeatKingWhale').title, 'Panthalus');
  assert.equal(byId.get('Main_UnlockPalBox').title, 'Palbox');
  assert.equal(byId.get('Main_UnlockPalBox').stage, null);
  for (const quest of quests.main) {
    assert.doesNotMatch(quest.title, /[<>|]|^en Text$/, quest.id);
    for (const next of quest.next) assert.ok(typeof next === 'string' && next.length > 0, quest.id);
  }
  for (let index = 0; index < staged.length - 1; index++) {
    const quest = staged[index];
    if (quest.next.length > 0) assert.ok(byId.has(quest.next[0]), quest.id);
  }
  assert.deepEqual(quests.completed_by_tower.ForestBoss, ['Main_DefeatForestBoss']);
  assert.ok(quests.completed_by_tower.GrassBoss.includes('Main_RayneSyndicate'));
});
