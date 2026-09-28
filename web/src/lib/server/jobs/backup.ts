import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { desc, eq } from 'drizzle-orm';
import type { Backup } from '$lib/api/types';
import { getDb, type Database } from '../db/client';
import { backups } from '../db/schema';
import { env } from '../env';

export interface BackupOptions {
  directory: string;
  command: string;
  databaseUrl: string;
  keep: number;
}

export function backupOptions(): BackupOptions {
  return {
    directory: env.backupDir,
    command: env.pgDumpCommand,
    databaseUrl: env.databaseUrl,
    keep: env.backupsKept
  };
}

export function backupFileName(at: Date): string {
  return `skylark-${at
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/-\d{3}Z$/, 'Z')}.dump`;
}

function splitCommand(command: string): { file: string; args: string[] } {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [command];
  const [file, ...args] = parts.map((part) => part.replace(/^"|"$/g, ''));
  return { file: file ?? 'pg_dump', args };
}

export function runDump(options: BackupOptions, target: string): Promise<{ bytes: number }> {
  return new Promise((resolve, reject) => {
    const { file, args } = splitCommand(options.command);
    const child = spawn(
      file,
      [
        ...args,
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        `--dbname=${options.databaseUrl}`
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      }
    );
    const output = createWriteStream(target);
    let bytes = 0;
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
    });
    child.stdout.pipe(output);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    output.on('error', (error) => {
      child.kill();
      reject(new Error(`cannot write ${target}: ${error.message}`, { cause: error }));
    });
    child.on('error', (error) => {
      output.close();
      reject(error);
    });
    child.on('close', (code) => {
      output.close(() => {
        if (code === 0) resolve({ bytes });
        else reject(new Error(`${file} exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      });
    });
  });
}

export async function listBackupFiles(
  directory: string
): Promise<{ file: string; size: number; mtime: Date }[]> {
  try {
    const names = await readdir(directory);
    const files: { file: string; size: number; mtime: Date }[] = [];
    for (const name of names) {
      if (!name.endsWith('.dump')) continue;
      const info = await stat(join(directory, name));
      if (info.isFile()) files.push({ file: name, size: info.size, mtime: info.mtime });
    }
    return files.sort((a, b) => b.file.localeCompare(a.file));
  } catch {
    return [];
  }
}

export async function pruneBackups(directory: string, keep: number): Promise<string[]> {
  const files = await listBackupFiles(directory);
  const removed: string[] = [];
  for (const entry of files.slice(keep)) {
    await unlink(join(directory, entry.file));
    removed.push(entry.file);
  }
  return removed;
}

export async function runBackup(
  db: Database = getDb(),
  options: BackupOptions = backupOptions(),
  now = new Date()
): Promise<Backup> {
  const file = backupFileName(now);
  const target = join(options.directory, file);
  try {
    await mkdir(options.directory, { recursive: true });
    await runDump(options, target);
    const info = await stat(target);
    if (info.size === 0) throw new Error('the dump file is empty');
    await db.insert(backups).values({ at: now, file, sizeBytes: info.size, ok: true });
    await pruneBackups(options.directory, options.keep);
    return { at: now.toISOString(), file, size_bytes: info.size, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await unlink(target).catch(() => undefined);
    await db.insert(backups).values({ at: now, file, sizeBytes: 0, ok: false, error: message });
    throw new Error(`backup failed: ${message}`, { cause: error });
  }
}

export async function listBackups(
  db: Database = getDb(),
  directory = env.backupDir
): Promise<Backup[]> {
  const rows = await db.select().from(backups).orderBy(desc(backups.at)).limit(100);
  const present = new Map((await listBackupFiles(directory)).map((entry) => [entry.file, entry]));
  return rows.map((row) => ({
    at: row.at.toISOString(),
    file: row.file,
    size_bytes: present.get(row.file)?.size ?? row.sizeBytes,
    ok: row.ok
  }));
}

export async function lastSuccessfulBackup(db: Database = getDb()) {
  const rows = await db
    .select()
    .from(backups)
    .where(eq(backups.ok, true))
    .orderBy(desc(backups.at))
    .limit(1);
  return rows[0] ?? null;
}

export async function backupSummary(db: Database = getDb(), directory = env.backupDir) {
  const last = await lastSuccessfulBackup(db);
  const files = await listBackupFiles(directory);
  const size = last
    ? (files.find((entry) => entry.file === last.file)?.size ?? last.sizeBytes)
    : null;
  return {
    last_at: last ? last.at.toISOString() : null,
    size_mb: size === null ? null : Math.round((size / 1024 / 1024) * 10) / 10,
    kept: files.length
  };
}

export async function nightlyBackupDue(db: Database = getDb(), now = new Date()): Promise<boolean> {
  const last = await lastSuccessfulBackup(db);
  if (!last) return true;
  return now.getTime() - last.at.getTime() >= 24 * 3600 * 1000;
}
