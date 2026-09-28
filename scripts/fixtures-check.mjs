import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixturesDir = join(root, 'web', 'fixtures', 'api');
const contract = parse(readFileSync(join(root, 'web', 'openapi.yaml'), 'utf8'));

function rewriteRefs(value, prefix) {
  if (Array.isArray(value)) return value.map((entry) => rewriteRefs(entry, prefix));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'discriminator') continue;
      if (
        key === '$ref' &&
        typeof entry === 'string' &&
        entry.startsWith('#/components/schemas/')
      ) {
        out[key] = `${prefix}#/$defs/${entry.slice('#/components/schemas/'.length)}`;
        continue;
      }
      out[key] = rewriteRefs(entry, prefix);
    }
    return out;
  }
  return value;
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema({
  $id: 'contract',
  $defs: rewriteRefs(contract.components.schemas, '')
});
const compiled = new Map();
function validatorFor(schema) {
  const key = JSON.stringify(schema);
  if (!compiled.has(key)) {
    compiled.set(key, ajv.compile({ ...schema, $id: `fixture-${compiled.size}` }));
  }
  return compiled.get(key);
}
function schemaRef(schema) {
  return rewriteRefs(schema, 'contract');
}

const problems = [];
function fail(file, message) {
  problems.push(`${file}: ${message}`);
}

function listFixtures(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFixtures(full, out);
    else out.push(full);
  }
  return out;
}

const getPaths = Object.entries(contract.paths)
  .filter(([, item]) => item.get)
  .map(([path, item]) => ({ path, operation: item.get }));

function fixtureNameFor(path) {
  return path.replace(/^\/api\/v1\//, '');
}

const servedLive = [
  '/api/v1/openapi.json',
  '/api/v1/stream',
  '/api/v1/zone/probe/',
  '/api/v1/admin/plugin/dll'
];

const expectedFixtures = new Map();
for (const { path, operation } of getPaths) {
  if (servedLive.some((live) => path === live || path.startsWith(live))) continue;
  const name = fixtureNameFor(path);
  const extension = path.endsWith('.png') ? '' : '.json';
  expectedFixtures.set(`${name}${extension}`, { path, operation });
}

const files = listFixtures(fixturesDir).map((file) =>
  relative(fixturesDir, file).split('\\').join('/')
);
const fileSet = new Set(files);
for (const name of expectedFixtures.keys()) {
  if (!fileSet.has(name)) fail(name, 'fixture missing for documented GET endpoint');
}

function loadJson(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function validate(name, schema, document) {
  const validator = validatorFor(schemaRef(schema));
  if (!validator(document)) {
    for (const error of validator.errors.slice(0, 8)) {
      fail(
        name,
        `${error.instancePath || '/'} ${error.message}${error.params && error.params.additionalProperty ? ` (${error.params.additionalProperty})` : ''}`
      );
    }
    return false;
  }
  return true;
}

const documents = new Map();
for (const name of files) {
  if (name === 'stream.json') continue;
  const expected = expectedFixtures.get(name);
  if (!expected) {
    fail(name, 'no documented GET endpoint matches this fixture');
    continue;
  }
  const success = expected.operation.responses['200'];
  if (name.endsWith('.png')) {
    const bytes = readFileSync(join(fixturesDir, name));
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!bytes.subarray(0, 8).equals(signature)) fail(name, 'not a PNG');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    documents.set(name, { width, height });
    continue;
  }
  const schema = success.content['application/json'].schema;
  const document = loadJson(name);
  documents.set(name, document);
  validate(name, schema, document);
}

if (fileSet.has('stream.json')) {
  const frames = loadJson('stream.json');
  if (!Array.isArray(frames) || frames.length === 0)
    fail('stream.json', 'must be a non-empty array of frames');
  else {
    const frameSchema = { $ref: '#/components/schemas/StreamFrame' };
    const dataSchemas = {
      status: 'Status',
      online: 'OnlineList',
      activity: 'ActivityItem'
    };
    frames.forEach((frame, index) => {
      if (!validate(`stream.json[${index}]`, frameSchema, frame)) return;
      validate(
        `stream.json[${index}].data`,
        { $ref: `#/components/schemas/${dataSchemas[frame.event]}` },
        frame.data
      );
      if (frame.event === 'activity' && frame.id !== frame.data.id)
        fail(`stream.json[${index}]`, 'activity frame id must equal data.id');
    });
    if (frames[0]?.event !== 'status') fail('stream.json', 'first frame must be a status frame');
    if (frames[1]?.event !== 'online') fail('stream.json', 'second frame must be an online frame');
  }
} else {
  fail('stream.json', 'missing');
}

const world = documents.get('world.json');
const map = documents.get('world/map.png');
if (world && map && world.map) {
  if (world.map.size_px !== map.width || world.map.size_px !== map.height) {
    fail(
      'world/map.png',
      `is ${map.width}x${map.height} but world.json documents size_px ${world.map.size_px}`
    );
  }
}

const players = documents.get('players.json');
const adminPlayers = documents.get('admin/players.json');
if (players && adminPlayers) {
  const known = new Map();
  for (const item of adminPlayers.items) known.set(item.id, item);
  for (const item of players.items) {
    const admin = known.get(item.id);
    if (!admin) fail('players.json', `player ${item.id} is not in admin/players.json`);
    else if (admin.display_name !== item.display_name || admin.platform !== item.platform) {
      fail('players.json', `player ${item.id} differs from admin/players.json`);
    }
  }
  const walk = (value, file, path) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, file, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (
        keys.length === 3 &&
        keys.includes('id') &&
        keys.includes('display_name') &&
        keys.includes('platform')
      ) {
        const admin = known.get(value.id);
        if (!admin) fail(file, `${path} references unknown player ${value.id}`);
        else if (admin.display_name !== value.display_name || admin.platform !== value.platform) {
          fail(file, `${path} references player ${value.id} with a different name or platform`);
        }
        return;
      }
      for (const key of keys) walk(value[key], file, `${path}.${key}`);
    }
  };
  for (const [file, document] of documents) {
    if (file.endsWith('.png')) continue;
    walk(document, file, '');
  }
  if (fileSet.has('stream.json')) walk(loadJson('stream.json'), 'stream.json', '');

  const detail = documents.get('players/{id}.json');
  if (detail) {
    const listItem = players.items.find((item) => item.id === detail.id);
    if (!listItem) fail('players/{id}.json', `player ${detail.id} is not in players.json`);
    else {
      for (const key of [
        'display_name',
        'platform',
        'platform_user_id',
        'display_id',
        'playtime_s',
        'sessions',
        'deaths',
        'kills',
        'boss_kills',
        'structures_built',
        'first_seen',
        'last_seen'
      ]) {
        if (JSON.stringify(listItem[key]) !== JSON.stringify(detail[key]))
          fail('players/{id}.json', `${key} disagrees with players.json`);
      }
    }
  }
}

const bosses = documents.get('bosses.json');
const bossDetail = documents.get('bosses/{key}.json');
if (bosses && bossDetail && !bosses.items.some((item) => item.key === bossDetail.key)) {
  fail('bosses/{key}.json', `boss ${bossDetail.key} is not in bosses.json`);
}
const raids = documents.get('raids.json');
const raidDetail = documents.get('raids/{id}.json');
if (raids && raidDetail && !raids.items.some((item) => item.id === raidDetail.id)) {
  fail('raids/{id}.json', `raid ${raidDetail.id} is not in raids.json`);
}
const runs = documents.get('runs.json');
const status = documents.get('status.json');
if (runs && status && status.run && !runs.items.some((item) => item.run_id === status.run.run_id)) {
  fail('status.json', 'run.run_id is not in runs.json');
}
const activity = documents.get('activity.json');
if (activity && raids && bosses) {
  for (const item of activity.items) {
    if (item.links.raid_id !== null && !raids.items.some((raid) => raid.id === item.links.raid_id))
      fail(
        'activity.json',
        `item ${item.id} links raid ${item.links.raid_id} which is not in raids.json`
      );
    if (
      item.links.boss_key !== null &&
      !bosses.items.some((boss) => boss.key === item.links.boss_key)
    )
      fail(
        'activity.json',
        `item ${item.id} links boss ${item.links.boss_key} which is not in bosses.json`
      );
    if (
      item.links.run_id !== null &&
      runs &&
      !runs.items.some((run) => run.run_id === item.links.run_id)
    )
      fail(
        'activity.json',
        `item ${item.id} links run ${item.links.run_id} which is not in runs.json`
      );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.log(problem);
  console.error(`fixtures:check: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(
  `fixtures:check: ${files.length} fixture(s) valid against ${expectedFixtures.size} documented GET endpoints`
);
