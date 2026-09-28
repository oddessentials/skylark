import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import { meta } from '../db/schema';
import { env } from '../env';
import { badRequest, conflict } from '../http/respond';

export const secretKeys = {
  collector: 'collector_secret',
  session: 'admin_session_secret',
  password: 'admin_password_hash'
} as const;

export const minimumPasswordLength = 8;
export const maximumPasswordLength = 200;

export type PasswordSource = 'environment' | 'stored' | 'unset';

export interface SecretEnvironment {
  readonly collectorSecret: string;
  readonly adminSessionSecret: string;
  readonly adminPassword: string;
}

export function parseNewPassword(body: unknown): string {
  const password =
    body !== null && typeof body === 'object'
      ? (body as { password?: unknown }).password
      : undefined;
  if (typeof password !== 'string') throw badRequest('password is required');
  if (password.length < minimumPasswordLength || password.length > maximumPasswordLength) {
    throw badRequest(
      `password must be ${minimumPasswordLength} to ${maximumPasswordLength} characters`
    );
  }
  return password;
}

const scryptCost = { N: 16384, r: 8, p: 1 } as const;
const hashLength = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, hashLength, scryptCost, (error, key) =>
      error ? reject(error) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return [
    'scrypt',
    scryptCost.N,
    scryptCost.r,
    scryptCost.p,
    salt.toString('base64url'),
    key.toString('base64url')
  ].join('$');
}

export async function passwordMatchesHash(candidate: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  if (Number(n) !== scryptCost.N || Number(r) !== scryptCost.r || Number(p) !== scryptCost.p) {
    return false;
  }
  const key = await derive(candidate, Buffer.from(salt, 'base64url'));
  const wanted = Buffer.from(expected, 'base64url');
  return key.length === wanted.length && timingSafeEqual(key, wanted);
}

function sameText(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createSecrets(
  environment: SecretEnvironment,
  database: () => Database = () => getDb()
) {
  const cache = new Map<string, string>();

  async function read(key: string): Promise<string | null> {
    const cached = cache.get(key);
    if (cached) return cached;
    const rows = await database()
      .select({ value: meta.value })
      .from(meta)
      .where(eq(meta.key, key))
      .limit(1);
    const value = rows[0]?.value ?? null;
    if (value) cache.set(key, value);
    return value;
  }

  async function generated(key: string): Promise<string> {
    const existing = await read(key);
    if (existing) return existing;
    await database()
      .insert(meta)
      .values({ key, value: randomBytes(32).toString('base64url') })
      .onConflictDoNothing();
    const value = await read(key);
    if (!value) throw new Error(`the ${key} secret could not be stored`);
    return value;
  }

  return {
    collectorSecret: (): Promise<string> =>
      environment.collectorSecret
        ? Promise.resolve(environment.collectorSecret)
        : generated(secretKeys.collector),

    collectorSecretFromEnvironment: (): boolean => environment.collectorSecret !== '',

    sessionSecret: (): Promise<string> =>
      environment.adminSessionSecret
        ? Promise.resolve(environment.adminSessionSecret)
        : generated(secretKeys.session),

    async regenerateCollectorSecret(): Promise<string> {
      if (environment.collectorSecret) {
        throw conflict('COLLECTOR_SECRET is set in the environment, so it cannot be regenerated');
      }
      const value = randomBytes(32).toString('base64url');
      await database()
        .insert(meta)
        .values({ key: secretKeys.collector, value })
        .onConflictDoUpdate({ target: meta.key, set: { value, updatedAt: new Date() } });
      cache.set(secretKeys.collector, value);
      return value;
    },

    async passwordSource(): Promise<PasswordSource> {
      if (environment.adminPassword) return 'environment';
      return (await read(secretKeys.password)) ? 'stored' : 'unset';
    },

    async verifyPassword(candidate: string): Promise<boolean> {
      if (environment.adminPassword) return sameText(candidate, environment.adminPassword);
      const stored = await read(secretKeys.password);
      if (!stored) return false;
      return passwordMatchesHash(candidate, stored);
    },

    async setInitialPassword(password: string): Promise<boolean> {
      if (environment.adminPassword) return false;
      const hash = await hashPassword(password);
      const inserted = await database()
        .insert(meta)
        .values({ key: secretKeys.password, value: hash })
        .onConflictDoNothing()
        .returning({ key: meta.key });
      if (inserted.length === 1) cache.set(secretKeys.password, hash);
      return inserted.length === 1;
    }
  };
}

export type Secrets = ReturnType<typeof createSecrets>;

export const secrets: Secrets = createSecrets(env);
