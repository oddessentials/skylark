import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageDir = join(root, 'tools', 'gamefacts', 'node_modules', 'ooz-wasm');
const target = join(root, 'savereader', 'internal', 'ooz', 'wasm.go');
const expectedVersion = '2.0.0';

function fail(message) {
  console.error(`savereader:wasm: ${message}`);
  process.exit(1);
}

let manifest;
let glue;
try {
  manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  glue = readFileSync(join(packageDir, 'build', 'ooz.js'), 'utf8');
} catch {
  fail(
    `ooz-wasm is not installed; run npm ci in tools/gamefacts, which pins ooz-wasm ${expectedVersion}`
  );
}
if (manifest.version !== expectedVersion) {
  fail(
    `tools/gamefacts has ooz-wasm ${manifest.version}; the save reader is built from ${expectedVersion}`
  );
}
const match = glue.match(/data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/);
if (!match) fail('build/ooz.js holds no embedded WebAssembly');
const wasm = Buffer.from(match[1], 'base64');
if (wasm.subarray(0, 4).toString('latin1') !== '\0asm')
  fail('the embedded data is not WebAssembly');

writeFileSync(target, `package ooz\n\nconst wasmBase64 = "${wasm.toString('base64')}"\n`);
const sha256 = createHash('sha256').update(wasm).digest('hex');
console.log(
  `savereader:wasm: wrote ${wasm.length} bytes of WebAssembly from ooz-wasm ${manifest.version} (sha256 ${sha256})`
);
