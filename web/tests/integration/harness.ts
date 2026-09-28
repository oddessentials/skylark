import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inject } from 'vitest';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/lib/server/db/migrate';
import * as schema from '../../src/lib/server/db/schema';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export interface TestDatabase {
  sql: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle<typeof schema>>;
  close: () => Promise<void>;
}

export function connectTestDatabase(): TestDatabase {
  const sql = postgres(inject('databaseUrl'), { max: 2, onnotice: () => {} });
  return {
    sql,
    db: drizzle(sql, { schema }),
    close: () => sql.end({ timeout: 5 })
  };
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env (npm install does this).');
  }
  const name = `skylark_test_${randomBytes(4).toString('hex')}`;
  const admin = postgres(withDatabaseName(base, 'postgres'), {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {}
  });
  try {
    await admin`select 1`;
  } catch (error) {
    const host = new URL(base).host;
    console.error(
      `\nDatabase unreachable at ${host}. Start the local database with:\n\n  docker compose up -d db\n`
    );
    await admin.end({ timeout: 1 });
    throw error;
  }
  await admin.unsafe(`create database "${name}"`);
  const url = withDatabaseName(base, name);
  await runMigrations(url);
  project.provide('databaseUrl', url);
  return async () => {
    await admin.unsafe(`drop database "${name}" with (force)`);
    await admin.end({ timeout: 5 });
  };
}
