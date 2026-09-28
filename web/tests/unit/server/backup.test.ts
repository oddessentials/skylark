import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupFileName, runDump, type BackupOptions } from '$lib/server/jobs/backup';

let directory = '';
let options: BackupOptions;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'skylark-backup-'));
  const script = join(directory, 'fake-dump.js');
  await writeFile(script, "process.stdout.write('dump');\n");
  options = {
    directory,
    command: `node ${script}`,
    databaseUrl: 'postgres://example/db',
    keep: 3
  };
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('runDump', () => {
  it('streams the dump into the target file and reports its size', async () => {
    const target = join(directory, backupFileName(new Date('2026-09-11T03:00:00Z')));
    await expect(runDump(options, target)).resolves.toEqual({ bytes: 4 });
    await expect(readFile(target, 'utf8')).resolves.toBe('dump');
  });

  it('rejects instead of crashing when the target cannot be opened', async () => {
    const target = join(directory, 'missing', 'skylark.dump');
    await expect(runDump(options, target)).rejects.toThrow(/cannot write .*ENOENT/);
  });
});
