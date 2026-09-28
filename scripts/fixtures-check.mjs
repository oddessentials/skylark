import { readdirSync, readFileSync } from 'node:fs';
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

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', $defs: rewriteRefs(contract.components.schemas, '') });
const compiled = new Map();
function validatorFor(schema) {
  const key = JSON.stringify(schema);
  if (!compiled.has(key)) {
    compiled.set(
      key,
      ajv.compile({ ...rewriteRefs(schema, 'contract'), $id: `fixture-${compiled.size}` })
    );
  }
  return compiled.get(key);
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

const servedLive = new Set(['/api/v1/openapi.json', '/api/v1/stream', '/api/v1/health']);
const expected = new Map();
for (const [path, item] of Object.entries(contract.paths)) {
  if (!item.get || !path.startsWith('/api/v1/') || servedLive.has(path)) continue;
  expected.set(`${path.slice('/api/v1/'.length)}.json`, item.get);
}

const files = listFixtures(fixturesDir).map((file) =>
  relative(fixturesDir, file).split('\\').join('/')
);
const fileSet = new Set(files);
for (const name of expected.keys()) {
  if (!fileSet.has(name)) fail(name, 'fixture missing for a documented GET endpoint');
}

function load(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function validate(name, schema, document) {
  const validator = validatorFor(schema);
  if (validator(document)) return true;
  for (const error of validator.errors.slice(0, 8)) {
    const extra = error.params?.additionalProperty ? ` (${error.params.additionalProperty})` : '';
    fail(name, `${error.instancePath || '/'} ${error.message}${extra}`);
  }
  return false;
}

const documents = new Map();
for (const name of files) {
  if (name === 'stream.json') continue;
  const operation = expected.get(name);
  if (!operation) {
    fail(name, 'no documented GET endpoint matches this fixture');
    continue;
  }
  const document = load(name);
  documents.set(name, document);
  validate(name, operation.responses['200'].content['application/json'].schema, document);
}

const frameSchemas = {
  status: 'Status',
  online: 'OnlineList',
  map: 'MapState',
  activity: 'ActivityItem'
};
let frames = [];
if (fileSet.has('stream.json')) {
  frames = load('stream.json');
  if (!Array.isArray(frames) || frames.length < 4) {
    fail('stream.json', 'must list the status, online and map frames and some activity');
    frames = [];
  }
  frames.forEach((frame, index) => {
    const name = `stream.json[${index}]`;
    if (!validate(name, { $ref: '#/components/schemas/StreamFrame' }, frame)) return;
    validate(name, { $ref: `#/components/schemas/${frameSchemas[frame.event]}` }, frame.data);
    if (frame.event === 'activity' && frame.id !== frame.data.id) {
      fail(name, 'an activity frame id must equal data.id');
    }
  });
  ['status', 'online', 'map'].forEach((event, index) => {
    if (frames[index]?.event !== event) fail('stream.json', `frame ${index} must be ${event}`);
  });
} else {
  fail('stream.json', 'missing');
}

const players = documents.get('players.json');
if (players) {
  const names = new Map(players.items.map((item) => [item.id, item.name]));
  const walk = (value, file, path) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, file, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const keys = Object.keys(value);
    const isRef =
      keys.length === 2 &&
      keys.includes('id') &&
      keys.includes('name') &&
      Number.isInteger(value.id);
    if (isRef) {
      if (!names.has(value.id)) fail(file, `${path} names unknown player ${value.id}`);
      else if (names.get(value.id) !== value.name) {
        fail(
          file,
          `${path} calls player ${value.id} "${value.name}", not "${names.get(value.id)}"`
        );
      }
      return;
    }
    for (const key of keys) walk(value[key], file, `${path}.${key}`);
  };
  for (const [file, document] of documents) {
    if (!file.startsWith('admin/')) walk(document, file, '');
  }
  walk(frames, 'stream.json', '');
  const detail = documents.get('players/{id}.json');
  if (detail && !names.has(detail.id)) {
    fail('players/{id}.json', `player ${detail.id} is not in players.json`);
  }
}
const guilds = documents.get('guilds.json');
const guild = documents.get('guilds/{id}.json');
if (guilds && guild && !guilds.items.some((item) => item.id === guild.id)) {
  fail('guilds/{id}.json', `guild ${guild.id} is not in guilds.json`);
}

const privatePatterns = [
  [/\b(?:steam|gdk|ps5|mac)_[0-9A-Za-z]+/, 'a platform user id'],
  [/\b[0-9A-F]{8}0{24}\b/, 'a player UID'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'an IP address']
];
const publicTexts = [...documents]
  .filter(([file]) => !file.startsWith('admin/'))
  .map(([file, document]) => [file, JSON.stringify(document)]);
publicTexts.push(['stream.json', JSON.stringify(frames)]);
for (const [file, text] of publicTexts) {
  for (const [pattern, what] of privatePatterns) {
    const match = pattern.exec(text);
    if (match) fail(file, `public fixture contains ${what}: ${match[0]}`);
  }
}

if (problems.length > 0) {
  console.error(`fixtures:check: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`fixtures:check: ${files.length} fixtures match the contract`);
