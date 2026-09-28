import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inject } from 'vitest';
import { getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { IngestBatch } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import * as schema from '../../src/lib/server/db/schema';
import { signBatch } from '../../src/lib/server/ingest/signature';
import {
  generateHistory,
  toBatches,
  type SimulatedHistory
} from '../../scripts/simulator/generator';

export async function resetDatabase(): Promise<void> {
  const names = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => getTableName(table as PgTable));
  const list = names.map((name) => `"${name}"`).join(', ');
  await getDb().execute(sql.raw(`truncate table ${list} restart identity`));
}

export function useTestDatabase(): string {
  const url = inject('databaseUrl');
  process.env.DATABASE_URL = url;
  process.env.BACKUP_DIR = mkdtempSync(join(tmpdir(), 'skylark-backups-'));
  process.env.PG_DUMP = pgDumpCommand();
  return url;
}

export function pgDumpCommand(): string {
  if (process.env.PG_DUMP) return process.env.PG_DUMP;
  const probe = spawnSync('pg_dump --version', { shell: true, stdio: 'ignore' });
  return probe.status === 0 ? 'pg_dump' : 'docker exec -i skylark-dev-db-1 pg_dump';
}

export const testSecret = () => process.env.COLLECTOR_SECRET ?? '';

export function seededHistory(days = 2, endAt = new Date()): SimulatedHistory {
  return generateHistory({ days, seed: 4242, endAt });
}

export function seededBatches(days = 2): IngestBatch[] {
  return toBatches(seededHistory(days));
}

export function signedRequest(
  batch: IngestBatch | string,
  overrides: Record<string, string> = {}
): Request {
  const body = typeof batch === 'string' ? batch : JSON.stringify(batch);
  const timestamp = overrides['x-skylark-timestamp'] ?? String(Math.floor(Date.now() / 1000));
  return new Request('http://test/api/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-skylark-timestamp': timestamp,
      'x-skylark-signature': signBatch(testSecret(), Number(timestamp), body),
      ...overrides
    },
    body
  });
}

export function routeEvent(request: Request, params: Record<string, string> = {}) {
  return {
    request,
    url: new URL(request.url),
    params,
    cookies: { get: () => undefined },
    getClientAddress: () => '127.0.0.1'
  } as unknown as import('@sveltejs/kit').RequestEvent;
}
