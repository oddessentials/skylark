import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Species } from './lib/facts/species.mjs';
import { TABLES } from './lib/facts/sources.mjs';
import { assetToPakPath, Game, need } from './lib/game.mjs';
import { writeJson } from './lib/output.mjs';
import { Pak } from './lib/pak.mjs';
import { encodePng } from './lib/png.mjs';
import { mipNoWiderThan, readTexture } from './lib/texture.mjs';

export const ICON_SIZE = 64;

function usage(message) {
  console.error(message);
  console.error(
    'usage: node tools/gamefacts/icons.mjs --pak <Pal-WindowsServer.pak> --client <Pal-Windows.pak> --out <dir> --facts <dir>'
  );
  process.exit(2);
}

function clientVersion(pak) {
  const ini = pak.read('Pal/Config/DefaultGame.ini').toString('utf8');
  const match = /^ProjectVersion=(.+)$/m.exec(ini);
  if (!match) throw new Error('the client pak has no ProjectVersion');
  return match[1].trim();
}

async function main() {
  const { values } = parseArgs({
    options: {
      pak: { type: 'string' },
      client: { type: 'string' },
      out: { type: 'string' },
      facts: { type: 'string' }
    },
    strict: true
  });
  for (const name of ['pak', 'client', 'out', 'facts']) {
    if (!values[name]) usage(`missing --${name}`);
  }
  const started = Date.now();
  const game = new Game(resolve(values.pak));
  const client = new Pak(resolve(values.client));
  const out = resolve(values.out);
  try {
    const serverVersion = game.gameVersion();
    const version = clientVersion(client);
    if (version !== serverVersion) {
      throw new Error(`the client pak is ${version} but the server pak is ${serverVersion}`);
    }
    const species = new Species(game);
    const icons = game.dataTable(TABLES.characterIcons);
    mkdirSync(out, { recursive: true });
    for (const name of readdirSync(out)) {
      if (name.endsWith('.png')) rmSync(join(out, name));
    }
    const written = [];
    let bytes = 0;
    for (const entry of species.entries) {
      const row = need(icons.row(entry.id), `icon row of ${entry.id}`);
      const asset = need(row.Icon, `icon of ${entry.id}`);
      const texture = readTexture(client, assetToPakPath(asset));
      const mip = mipNoWiderThan(texture, ICON_SIZE);
      const png = encodePng(mip.width, mip.height, mip.decode());
      writeFileSync(join(out, `${entry.id}.png`), png);
      bytes += png.length;
      written.push(entry.id);
    }
    await writeJson(resolve(values.facts), 'icons.json', {
      game_version: version,
      sources: [TABLES.characterIcons, 'Pal-Windows.pak /Game/Pal/Texture/PalIcon textures'],
      size: ICON_SIZE,
      species: written
    });
    console.log(
      `wrote ${written.length} icons (${(bytes / 1024).toFixed(0)} KB) from game version ${version} in ${((Date.now() - started) / 1000).toFixed(1)} s`
    );
  } finally {
    game.close();
    client.close();
  }
}

await main();
