import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildBosses } from './lib/facts/bosses.mjs';
import { buildElements } from './lib/facts/elements.mjs';
import { buildLandmarks } from './lib/facts/landmarks.mjs';
import { buildMap } from './lib/facts/map.mjs';
import { buildNames } from './lib/facts/names.mjs';
import { buildPals } from './lib/facts/pals.mjs';
import { buildRegions } from './lib/facts/regions.mjs';
import { Species } from './lib/facts/species.mjs';
import { Game } from './lib/game.mjs';
import { World } from './lib/level.mjs';
import { writeJson } from './lib/output.mjs';

const ACTOR_KINDS = {
  regionTriggers: /^BP_PalRegionTrigger(Box|Sphere)_C$/,
  fastTravel: /^BP_LevelObject_TowerFastTravelPoint_C$/,
  watchtowers: /^BP_LevelObject_UnlockMapPoint_C$/,
  startPoints: /^BP_LevelObject_StaticRespawnPoint_C$/,
  towers: /^BP_PalBossTower(_[A-Za-z]+)?_C$/,
  dungeonMarkers: /^BP_DungeonPortalMarker_.+_C$/,
  dungeonEntrances: /^BP_DungeonFixedEntrance_.+_C$/
};

function usage(message) {
  console.error(message);
  console.error(
    'usage: node tools/gamefacts/extract.mjs --pak <Pal-WindowsServer.pak> --out <dir>'
  );
  process.exit(2);
}

const serverApp = 2394010;

function steamBuild(pakPath) {
  const root = resolve(dirname(pakPath), '..', '..', '..');
  const manifest = join(root, 'steamapps', `appmanifest_${serverApp}.acf`);
  if (!existsSync(manifest)) return null;
  const match = /"buildid"s+"(d+)"/.exec(readFileSync(manifest, 'utf8'));
  return match ? Number(match[1]) : null;
}

function partition(found) {
  const groups = Object.fromEntries(Object.keys(ACTOR_KINDS).map((kind) => [kind, []]));
  for (const actor of found) {
    const kind = Object.keys(ACTOR_KINDS).find((key) => ACTOR_KINDS[key].test(actor.className));
    groups[kind].push(actor);
  }
  return groups;
}

async function main() {
  const { values } = parseArgs({
    options: { pak: { type: 'string' }, out: { type: 'string' } },
    strict: true
  });
  if (!values.pak) usage('missing --pak');
  if (!values.out) usage('missing --out');
  const started = Date.now();
  const game = new Game(resolve(values.pak));
  const out = resolve(values.out);
  try {
    const gameVersion = game.gameVersion();
    console.log(`game version ${gameVersion}, ${game.pak.entries.size} files in the pak`);
    const species = new Species(game);
    const map = buildMap(game, gameVersion);
    const world = new World(game);
    const pattern = new RegExp(
      Object.values(ACTOR_KINDS)
        .map((expression) => expression.source)
        .join('|')
    );
    const actors = partition(world.findActors(pattern));
    const landmarks = buildLandmarks(game, world, actors, species, map, gameVersion);
    const files = {
      'pals.json': buildPals(game, species, gameVersion),
      'elements.json': buildElements(game, gameVersion),
      'map.json': map,
      'regions.json': buildRegions(game, world, actors.regionTriggers, gameVersion),
      'landmarks.json': landmarks,
      'bosses.json': buildBosses(game, species, landmarks.towers, gameVersion),
      'names.json': buildNames(game, species, gameVersion)
    };
    for (const [name, data] of Object.entries(files)) {
      const size = await writeJson(out, name, data);
      console.log(`wrote ${name} (${size} bytes)`);
    }
    const build = steamBuild(resolve(values.pak));
    if (build) {
      await writeJson(out, 'build.json', { app: serverApp, build, version: gameVersion });
      console.log(`wrote build.json (Steam build ${build})`);
    } else {
      console.log(
        `no Steam app manifest beside the pak; set the build in ${join(out, 'build.json')} by hand`
      );
    }
    const pals = files['pals.json'];
    console.log(
      [
        `palpedia entries ${pals.pals.length}`,
        `actor classes ${Object.keys(pals.classes).length}`,
        `regions ${files['regions.json'].regions.length}`,
        `fast travel ${landmarks.fast_travel.length}`,
        `watchtowers ${landmarks.watchtowers.length}`,
        `boss markers ${landmarks.boss_markers.length}`,
        `boss battles ${files['bosses.json'].battles.length}`,
        `raid summons ${files['bosses.json'].raids.length}`,
        `technologies ${files['names.json'].technologies.length}`,
        `structures ${files['names.json'].structures.length}`,
        `humans ${files['names.json'].humans.length}`
      ].join(', ')
    );
    console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    game.close();
  }
}

await main();
