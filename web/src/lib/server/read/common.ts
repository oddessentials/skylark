import { eq, inArray } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import type { Database } from '../db/client';
import { guilds, players, serverState, type PlayerRow, type ServerStateRow } from '../db/schema';
import { serverStateId } from '../ingest/context';
import { classes as palClasses } from '$lib/world/pals.json';

export type Schemas = components['schemas'];
export type PlayerRef = Schemas['PlayerRef'];
export type GuildRef = Schemas['GuildRef'];
export type Platform = Schemas['Platform'];
export type ChatChannel = Schemas['ChatChannel'];

export const deathAction = 'BP_ActionDeath';

export function displayName(row: Pick<PlayerRow, 'name' | 'nameOverride'>): string {
  return row.nameOverride ?? row.name;
}

export function playerRef(row: Pick<PlayerRow, 'id' | 'name' | 'nameOverride'>): PlayerRef {
  return { id: row.id, name: displayName(row) };
}

export function platformName(value: string): Platform {
  return value === 'steam' || value === 'gdk' || value === 'ps5' || value === 'mac'
    ? value
    : 'other';
}

const classSpecies = new Map(
  Object.entries(palClasses as unknown as Record<string, { species: string | null }>).map(
    ([name, entry]) => [name.toLowerCase(), entry.species]
  )
);

export function speciesOf(className: string): string {
  const known = classSpecies.get(className.toLowerCase());
  if (known) return known;
  let species = className;
  if (species.startsWith('BP_')) species = species.slice(3);
  if (species.endsWith('_C')) species = species.slice(0, -2);
  return species;
}

export function chatChannel(raw: string): ChatChannel {
  switch (raw.toLowerCase()) {
    case 'global':
      return 'global';
    case 'guild':
      return 'guild';
    case 'say':
      return 'say';
    default:
      return 'other';
  }
}

export async function readServerState(db: Database): Promise<ServerStateRow | null> {
  const rows = await db.select().from(serverState).where(eq(serverState.id, serverStateId));
  return rows[0] ?? null;
}

export async function guildNames(
  db: Database,
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ id: guilds.id, name: guilds.name })
    .from(guilds)
    .where(inArray(guilds.id, wanted));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function guildRef(id: string | null, names: Map<string, string>): GuildRef | null {
  if (!id) return null;
  const name = names.get(id);
  return name === undefined ? null : { id, name };
}

export async function playersById(
  db: Database,
  ids: (number | null)[]
): Promise<Map<number, PlayerRow>> {
  const wanted = [...new Set(ids.filter((id): id is number => typeof id === 'number'))];
  if (wanted.length === 0) return new Map();
  const rows = await db.select().from(players).where(inArray(players.id, wanted));
  return new Map(rows.map((row) => [row.id, row]));
}

export function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 1000);
}
