import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export const defaultMigrationsFolder = fileURLToPath(
  new URL('../../../../drizzle', import.meta.url)
);

export async function runMigrations(
  databaseUrl: string,
  migrationsFolder: string = defaultMigrationsFolder
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('migrate: DATABASE_URL is not set');
    process.exit(1);
  }
  runMigrations(databaseUrl)
    .then(() => {
      console.log(`migrate: database is up to date (${defaultMigrationsFolder})`);
    })
    .catch((error: unknown) => {
      console.error('migrate: failed', error);
      process.exit(1);
    });
}
