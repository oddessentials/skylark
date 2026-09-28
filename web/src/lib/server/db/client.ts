import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { env } from '../env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

let sqlClient: Sql | null = null;
let database: Database | null = null;
let jobSqlClient: Sql | null = null;
let jobDatabase: Database | null = null;

export function getSql(): Sql {
  if (!sqlClient) {
    sqlClient = postgres(env.databaseUrl, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 5,
      onnotice: () => {}
    });
  }
  return sqlClient;
}

export function getDb(): Database {
  if (!database) database = drizzle(getSql(), { schema });
  return database;
}

export function getJobDb(): Database {
  if (!jobDatabase) {
    jobSqlClient = postgres(env.databaseUrl, {
      max: 1,
      idle_timeout: 30,
      connect_timeout: 5,
      onnotice: () => {}
    });
    jobDatabase = drizzle(jobSqlClient, { schema });
  }
  return jobDatabase;
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await getSql()`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  const clients = [sqlClient, jobSqlClient].filter((client) => client !== null);
  sqlClient = null;
  database = null;
  jobSqlClient = null;
  jobDatabase = null;
  await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
}
