import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const separator = args.indexOf('--');
if (separator === -1 || separator === args.length - 1) {
  console.error('usage: node scripts/run-with-env.mjs KEY=VALUE ... -- <command> [args]');
  process.exit(2);
}

const env = { ...process.env };
for (const assignment of args.slice(0, separator)) {
  const eq = assignment.indexOf('=');
  if (eq <= 0) {
    console.error(`run-with-env: expected KEY=VALUE, got "${assignment}"`);
    process.exit(2);
  }
  env[assignment.slice(0, eq)] = assignment.slice(eq + 1);
}

const [command, ...commandArgs] = args.slice(separator + 1);
const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  shell: true,
  env
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
