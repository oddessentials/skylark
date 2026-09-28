import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageDir = join(root, 'mod', 'SkylarkEvents');
const script = join(packageDir, 'Scripts', 'main.lua');
const globals = new Set([
  'RegisterHook',
  'StaticFindObject',
  'FindAllOf',
  'debug',
  'io',
  'ipairs',
  'math',
  'os',
  'pairs',
  'pcall',
  'print',
  'string',
  'table',
  'tostring',
  'type'
]);
const required = ['ModName', 'PackageName', 'Author', 'Description', 'Dependencies', 'InstallRule'];

function fail(message) {
  console.error(`mod: ${message}`);
  process.exit(1);
}

function readInfo() {
  const info = JSON.parse(readFileSync(join(packageDir, 'Info.json'), 'utf8'));
  for (const key of required) {
    if (!(key in info)) fail(`Info.json has no ${key}`);
  }
  if ('Version' in info) {
    fail('Info.json must not carry a Version; packaging stamps it from package.json');
  }
  if (info.PackageName !== 'SkylarkEvents') fail('the package name must stay SkylarkEvents');
  if (!info.InstallRule.some((rule) => rule.Type === 'Lua' && rule.IsServer === true)) {
    fail('Info.json needs a Lua install rule with IsServer true');
  }
  return info;
}

function collectorTypes() {
  const source = readFileSync(
    join(root, 'collector', 'internal', 'modevents', 'modevents.go'),
    'utf8'
  );
  return new Set([...source.matchAll(/Type[A-Za-z]+\s*=\s*"([a-z]+)"/g)].map((match) => match[1]));
}

async function check() {
  readInfo();
  const { default: luaparse } = await import('luaparse');
  const source = readFileSync(script, 'utf8');
  const ast = luaparse.parse(source, { luaVersion: '5.3', scope: true });
  const unknown = ast.globals.map((node) => node.name).filter((name) => !globals.has(name));
  if (unknown.length > 0)
    fail(`main.lua uses unknown globals: ${[...new Set(unknown)].join(', ')}`);
  const known = collectorTypes();
  const emitted = [...source.matchAll(/emit\("([a-z]+)"/g)].map((match) => match[1]);
  if (emitted.length === 0) fail('main.lua emits nothing');
  for (const type of emitted) {
    if (!known.has(type)) fail(`main.lua emits ${type}, which the collector does not read`);
  }
  for (const type of known) {
    if (!emitted.includes(type)) fail(`the collector reads ${type}, which main.lua never emits`);
  }
  console.log(`mod: Info.json and main.lua check out (${new Set(emitted).size} event types)`);
}

function stage(out) {
  const info = readInfo();
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const target = join(resolve(out), 'SkylarkEvents');
  if (existsSync(target)) rmSync(target, { recursive: true });
  mkdirSync(target, { recursive: true });
  cpSync(join(packageDir, 'Scripts'), join(target, 'Scripts'), { recursive: true });
  cpSync(join(packageDir, 'enabled.txt'), join(target, 'enabled.txt'));
  cpSync(join(root, 'mod', 'README.md'), join(target, 'README.md'));
  cpSync(join(root, 'LICENSE'), join(target, 'LICENSE'));
  writeFileSync(
    join(target, 'Info.json'),
    `${JSON.stringify({ ...info, Version: version }, null, 2)}\n`
  );
  console.log(`mod: staged SkylarkEvents ${version} in ${target}`);
}

const { values } = parseArgs({ options: { out: { type: 'string' } }, strict: true });
if (values.out) stage(values.out);
else await check();
