import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '$lib/server/env';

const database = { DATABASE_URL: 'postgres://skylark:skylark@db:5432/skylark' };

describe('the environment', () => {
  it('needs only the database address and defaults everything else', () => {
    const env = validateEnvironment(database);
    expect(env).toMatchObject({
      databaseUrl: database.DATABASE_URL,
      collectorSecret: '',
      adminPassword: '',
      adminSessionSecret: '',
      publicSiteName: '',
      origin: '',
      port: 3000,
      apiMock: false,
      logLevel: 'info',
      backupDir: '/backups',
      backupsKept: 14
    });
  });

  it('reports a missing database address', () => {
    expect(() => validateEnvironment({})).toThrow(/missing environment variables: DATABASE_URL/);
  });

  it('keeps the values that are set', () => {
    const env = validateEnvironment({
      ...database,
      COLLECTOR_SECRET: 'collector',
      PUBLIC_SITE_NAME: 'Sunreach',
      API_MOCK: '1',
      LOG_LEVEL: 'debug',
      BACKUPS_KEPT: '3'
    });
    expect(env).toMatchObject({
      collectorSecret: 'collector',
      publicSiteName: 'Sunreach',
      apiMock: true,
      logLevel: 'debug',
      backupsKept: 3
    });
  });

  it('rejects values that cannot work', () => {
    expect(() => validateEnvironment({ ...database, API_MOCK: 'yes' })).toThrow(
      /API_MOCK must be 0, 1, true or false/
    );
    expect(() => validateEnvironment({ ...database, LOG_LEVEL: 'loud' })).toThrow(
      /LOG_LEVEL must be one of/
    );
    expect(() => validateEnvironment({ ...database, BACKUPS_KEPT: '-1' })).toThrow(
      /BACKUPS_KEPT must be a non-negative integer/
    );
  });
});
