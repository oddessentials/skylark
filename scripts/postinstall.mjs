import { copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

if (existsSync(join(root, '.git'))) {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: 'inherit'
  });
}

const envFile = join(root, '.env');
const exampleFile = join(root, '.env.example');
if (!existsSync(envFile) && existsSync(exampleFile)) {
  copyFileSync(exampleFile, envFile);
  console.log('postinstall: created .env from .env.example with local defaults');
}
