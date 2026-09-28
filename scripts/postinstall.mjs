import { copyFileSync, existsSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

if (existsSync(join(root, '.git'))) {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: 'inherit'
  });
}

const factsDir = join(root, 'tools', 'gamefacts');
if (
  existsSync(join(factsDir, 'package-lock.json')) &&
  !existsSync(join(factsDir, 'node_modules'))
) {
  execSync('npm ci --no-audit --no-fund', { cwd: factsDir, stdio: 'inherit' });
  console.log('postinstall: installed the game facts tools in tools/gamefacts');
}

const envFile = join(root, '.env');
const exampleFile = join(root, '.env.example');
if (!existsSync(envFile) && existsSync(exampleFile)) {
  copyFileSync(exampleFile, envFile);
  console.log('postinstall: created .env from .env.example with local defaults');
}
