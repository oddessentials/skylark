import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const collector = join(root, 'collector');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const mode = process.argv[2];

const targets = [
  { goos: 'windows', goarch: 'amd64', suffix: '.exe' },
  { goos: 'linux', goarch: 'amd64', suffix: '' },
  { goos: 'linux', goarch: 'arm64', suffix: '' }
];

function toolchain() {
  const probe = spawnSync('go', ['version'], { stdio: 'ignore' });
  if (probe.status === 0) return { go: 'go', gofmt: 'gofmt' };
  const local = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', 'go', 'bin')
    : '';
  if (local && existsSync(join(local, 'go.exe'))) {
    return { go: join(local, 'go.exe'), gofmt: join(local, 'gofmt.exe') };
  }
  console.error('collector: Go 1.27 or newer is required and was not found on PATH');
  process.exit(1);
}

const { go, gofmt } = toolchain();

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: collector,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function formatted() {
  const result = spawnSync(gofmt, ['-l', '.'], { cwd: collector, encoding: 'utf8' });
  if (result.error) throw result.error;
  const files = result.stdout.trim();
  if (files !== '') {
    console.error(`collector: gofmt would change:\n${files}`);
    process.exit(1);
  }
}

const ldflags = `-s -w -X github.com/oddessentials/skylark/collector/internal/buildinfo.Version=${version}`;

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
          join('dist', `skylark-collector-${target.goos}-${target.goarch}${target.suffix}`),
          './cmd/skylark-collector'
        ],
        { GOOS: target.goos, GOARCH: target.goarch, CGO_ENABLED: '0' }
      );
    }
    console.log(`collector: built ${version} for ${targets.length} targets in collector/dist`);
    break;
  case 'test':
    run(go, ['test', '-count=1', './...']);
    break;
  case 'vet':
    formatted();
    run(go, ['vet', './...']);
    break;
  default:
    console.error('usage: node scripts/collector.mjs <build|test|vet>');
    process.exit(2);
}
