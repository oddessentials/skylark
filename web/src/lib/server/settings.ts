import { getDb, type Database } from './db/client';
import { settings as settingsTable } from './db/schema';
import { env } from './env';
import { badRequest, conflict } from './http/respond';

export const featureNames = ['chat', 'guild_chat', 'positions', 'bases', 'pals'] as const;
export type FeatureName = (typeof featureNames)[number];
export type Features = Record<FeatureName, boolean>;

export interface SiteSettings {
  site_name: string;
  features: Features;
}

export const lockableFields = ['site_name'] as const;
export type LockableField = (typeof lockableFields)[number];

export interface ResolvedSettings extends SiteSettings {
  locked: LockableField[];
}

export interface SettingsUpdate {
  site_name?: string;
  features?: Partial<Features>;
}

export interface SettingsEnvironment {
  readonly publicSiteName: string;
}

export const environmentVariables: Record<LockableField, string> = {
  site_name: 'PUBLIC_SITE_NAME'
};

export const defaultSettings: SiteSettings = {
  site_name: 'Palworld server',
  features: { chat: true, guild_chat: false, positions: true, bases: true, pals: true }
};

export const siteNameMaxLength = 60;

const updatableKeys = new Set(['site_name', 'features']);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseSettingsUpdate(body: unknown): SettingsUpdate {
  if (!isObject(body)) throw badRequest('body must be a JSON object');
  for (const key of Object.keys(body)) {
    if (!updatableKeys.has(key)) throw badRequest(`${key} is not a setting`);
  }
  const update: SettingsUpdate = {};
  if ('site_name' in body) {
    if (typeof body.site_name !== 'string') throw badRequest('site_name must be a string');
    const name = body.site_name.trim();
    if (name.length === 0 || name.length > siteNameMaxLength) {
      throw badRequest(`site_name must be 1 to ${siteNameMaxLength} characters`);
    }
    update.site_name = name;
  }
  if ('features' in body) {
    if (!isObject(body.features)) throw badRequest('features must be an object');
    const features: Partial<Features> = {};
    for (const [name, value] of Object.entries(body.features)) {
      if (!(featureNames as readonly string[]).includes(name)) {
        throw badRequest(`${name} is not a feature`);
      }
      if (typeof value !== 'boolean') throw badRequest(`features.${name} must be true or false`);
      features[name as FeatureName] = value;
    }
    update.features = features;
  }
  return update;
}

export function lockedFields(environment: SettingsEnvironment): LockableField[] {
  return environment.publicSiteName ? ['site_name'] : [];
}

export function resolveSettings(
  stored: Record<string, unknown>,
  environment: SettingsEnvironment
): ResolvedSettings {
  const storedName = typeof stored.site_name === 'string' ? stored.site_name.trim() : '';
  const storedFeatures = isObject(stored.features) ? stored.features : {};
  const features = { ...defaultSettings.features };
  for (const name of featureNames) {
    const value = storedFeatures[name];
    if (typeof value === 'boolean') features[name] = value;
  }
  return {
    site_name: environment.publicSiteName || storedName || defaultSettings.site_name,
    features,
    locked: lockedFields(environment)
  };
}

export function createSettingsStore(
  environment: SettingsEnvironment,
  database: () => Database = () => getDb()
) {
  async function stored(db: Database): Promise<Record<string, unknown>> {
    const rows = await db.select().from(settingsTable);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async function read(db: Database = database()): Promise<ResolvedSettings> {
    return resolveSettings(await stored(db), environment);
  }

  async function write(update: SettingsUpdate): Promise<ResolvedSettings> {
    for (const field of lockedFields(environment)) {
      if (update[field] !== undefined) {
        throw conflict(
          `${field} is set by the ${environmentVariables[field]} environment variable`
        );
      }
    }
    const current = await read();
    const rows: { key: string; value: unknown }[] = [];
    if (update.site_name !== undefined) rows.push({ key: 'site_name', value: update.site_name });
    if (update.features !== undefined) {
      rows.push({ key: 'features', value: { ...current.features, ...update.features } });
    }
    const now = new Date();
    for (const row of rows) {
      await database()
        .insert(settingsTable)
        .values({ key: row.key, value: row.value, updatedAt: now })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: row.value, updatedAt: now }
        });
    }
    return read();
  }

  return { read, write };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

export const featureLabels: Record<FeatureName, string> = {
  chat: 'Chat',
  guild_chat: 'Guild chat',
  positions: 'Player positions',
  bases: 'Bases',
  pals: 'Pals'
};

export const siteSettings: SettingsStore = createSettingsStore(env);

export async function siteFeatures(db?: Database): Promise<Features> {
  return (await siteSettings.read(db)).features;
}
