import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const modules = {
  collector: {
    binary: 'skylark-collector',
    main: './cmd/skylark-collector',
    versionVariable: 'github.com/oddessentials/skylark/collector/internal/buildinfo.Version'
  },
  savereader: {
    binary: 'skylark-savereader',
    main: './cmd/skylark-savereader',
    versionVariable: 'main.version'
  }
};

const targets = [
  { goos: 'windows', goarch: 'amd64', suffix: '.exe' },
  { goos: 'linux', goarch: 'amd64', suffix: '' },
  { goos: 'linux', goarch: 'arm64', suffix: '' }
];

const [name, mode] = process.argv.slice(2);
const module = modules[name];
if (!module) {
  console.error(`usage: node scripts/go.mjs <${Object.keys(modules).join('|')}> <build|test|vet>`);
  process.exit(2);
}
const dir = join(root, name);

function toolchain() {
  const probe = spawnSync('go', ['version'], { stdio: 'ignore' });
  if (probe.status === 0) return { go: 'go', gofmt: 'gofmt' };
  const local = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', 'go', 'bin')
    : '';
  if (local && existsSync(join(local, 'go.exe'))) {
    return { go: join(local, 'go.exe'), gofmt: join(local, 'gofmt.exe') };
  }
  console.error(`${name}: Go 1.27 or newer is required and was not found on PATH`);
  process.exit(1);
}

const { go, gofmt } = toolchain();

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function formatted() {
  const result = spawnSync(gofmt, ['-l', '.'], { cwd: dir, encoding: 'utf8' });
  if (result.error) throw result.error;
  const files = result.stdout.trim();
  if (files !== '') {
    console.error(`${name}: gofmt would change:\n${files}`);
    process.exit(1);
  }
}

const ldflags = `-s -w -X ${module.versionVariable}=${version}`;

switch (mode) {
  case 'build':
    for (const target of targets) {
      run(
        go,
        [
          'build',
          '-trimpath',
          '-ldflags',
          ldflags,
          '-o',
          join('dist', `${module.binary}-${target.goos}-${target.goarch}${target.suffix}`),
          module.main
        ],
        { GOOS: target.goos, GOARCH: target.goarch, CGO_ENABLED: '0' }
      );
    }
    console.log(`${name}: built ${version} for ${targets.length} targets in ${name}/dist`);
    break;
  case 'test':
    run(go, ['test', '-count=1', './...']);
    break;
  case 'vet':
    formatted();
    run(go, ['vet', './...']);
    break;
  default:
    console.error(`usage: node scripts/go.mjs ${name} <build|test|vet>`);
    process.exit(2);
}
