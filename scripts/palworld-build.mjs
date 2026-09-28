import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const recorded = JSON.parse(
  readFileSync(new URL('../web/src/lib/world/build.json', import.meta.url), 'utf8')
);
const response = await fetch(`https://api.steamcmd.net/v1/info/${recorded.app}`);
if (!response.ok) {
  console.error(`palworld build: api.steamcmd.net answered ${response.status}`);
  process.exit(1);
}
const document = await response.json();
const branch = document?.data?.[recorded.app]?.depots?.branches?.public;
const build = Number(branch?.buildid);
if (!Number.isInteger(build) || build <= 0) {
  console.error('palworld build: the answer has no public build id');
  process.exit(1);
}
const updated = new Date(Number(branch.timeupdated) * 1000).toISOString().slice(0, 10);
if (build === recorded.build) {
  console.log(`palworld build: the facts match the public build ${build}`);
  process.exit(0);
}
console.log(
  `palworld build: the public build is ${build} (${updated}); the facts come from ${recorded.build} (${recorded.version})`
);
if (!process.argv.includes('--issue')) process.exit(0);

const title = `Palworld server build ${build} is out`;
const open = execFileSync(
  'gh',
  ['issue', 'list', '--state', 'open', '--search', `"${title}" in:title`, '--json', 'number'],
  { encoding: 'utf8' }
);
if (JSON.parse(open).length > 0) {
  console.log('palworld build: an open issue already tracks it');
  process.exit(0);
}
const body = [
  `The dedicated server's public build on Steam (app ${recorded.app}) is now ${build}, updated ${updated}. Skylark's game facts come from build ${recorded.build}, version ${recorded.version}.`,
  '',
  '- [ ] Update the rig with SteamCMD and run `npm run facts:extract -- --pak <path to Pal-WindowsServer.pak>`; it rewrites `web/src/lib/world`, including `build.json`. Review the diff.',
  '- [ ] Check what the collector reads against the new server: the REST routes and fields, the JSON log events and the `/game-data` actor fields.',
  '- [ ] Check what the save reader reads: the save header, the GVAS layout, the guild and base blobs and the EPalGuildRole values.',
  '- [ ] Record the new version beside the facts it confirms, and note anything that changed.'
].join('\n');
execFileSync('gh', ['issue', 'create', '--title', title, '--body', body], { stdio: 'inherit' });
