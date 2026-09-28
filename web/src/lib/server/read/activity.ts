import { and, asc, desc, eq, gt, inArray, isNull, lt, not, or, sql, type SQL } from 'drizzle-orm';
import { baseNameOf, regionAt } from '$lib/world/regions';
import type { Database } from '../db/client';
import { deaths, events, players, sessions, type EventRow } from '../db/schema';
import { badRequest, type KeysetPage } from '../http/respond';
import type { Features } from '../settings';
import {
  chatChannel,
  guildNames,
  playerRef,
  playersById,
  type GuildRef,
  type Schemas
} from './common';
import { bossName, killerOf, speciesOfCharacter, technologyName } from './names';

export type ActivityItem = Schemas['ActivityItem'];
export type ActivityType = Schemas['ActivityType'];
export type ActivityDetails = Schemas['ActivityDetails'];

export const activityTypes: readonly ActivityType[] = [
  'server.online',
  'server.offline',
  'collector.lost',
  'player.joined',
  'player.left',
  'player.level_up',
  'player.died',
  'chat.message',
  'base.established',
  'base.removed',
  'guild.renamed',
  'player.guild_joined',
  'pal.captured',
  'pal.hatched',
  'boss.defeated',
  'technology.unlocked'
];

export function visibleTypes(features: Features, requested: readonly ActivityType[] | null) {
  return (requested ?? activityTypes).filter((type) => {
    if (type === 'chat.message') return features.chat;
    if (type === 'base.established' || type === 'base.removed') return features.bases;
    if (type === 'pal.captured' || type === 'pal.hatched') return features.pals;
    return true;
  });
}

export function parseTypes(raw: string | null): ActivityType[] | null {
  if (raw === null || raw.trim() === '') return null;
  const types = raw.split(',').map((part) => part.trim());
  for (const type of types) {
    if (!(activityTypes as readonly string[]).includes(type)) {
      throw badRequest(`${type} is not an activity type`);
    }
  }
  return types as ActivityType[];
}

function feedFilter(features: Features, types: readonly ActivityType[]): SQL {
  const conditions: SQL[] = [
    inArray(events.type, types.length > 0 ? [...types] : ['none']),
    eq(events.quiet, false),
    isNull(events.invalid),
    or(isNull(events.playerId), eq(players.hidden, false))!
  ];
  if (features.chat && !features.guild_chat) {
    conditions.push(
      not(and(eq(events.type, 'chat.message'), sql`lower(${events.data}->>'channel') = 'guild'`)!)
    );
  }
  return and(...conditions)!;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function guildOf(id: unknown, name: unknown, names: Map<string, string>): GuildRef | null {
  if (typeof id !== 'string' || id === '') return null;
  const known = typeof name === 'string' && name !== '' ? name : names.get(id);
  return known ? { id, name: known } : null;
}

export async function buildActivityItems(
  db: Database,
  rows: EventRow[],
  features: Features
): Promise<ActivityItem[]> {
  if (rows.length === 0) return [];
  const people = await playersById(
    db,
    rows.map((row) => row.playerId)
  );
  const guildIds: string[] = [];
  for (const row of rows) {
    const data = row.data as Record<string, unknown>;
    for (const key of ['guild_id', 'previous_guild_id']) {
      if (typeof data[key] === 'string') guildIds.push(data[key] as string);
    }
  }
  const names = await guildNames(db, guildIds);
  const diedIds = rows.filter((row) => row.type === 'player.died').map((row) => row.id);
  const knockouts = new Map<string, typeof deaths.$inferSelect>();
  if (diedIds.length > 0) {
    const found = await db.select().from(deaths).where(inArray(deaths.eventId, diedIds));
    for (const death of found) knockouts.set(death.eventId, death);
  }
  const leftIds = rows.filter((row) => row.type === 'player.left').map((row) => row.id);
  const durations = new Map<string, number | null>();
  if (leftIds.length > 0) {
    const closed = await db
      .select({ leftEventId: sessions.leftEventId, durationS: sessions.durationS })
      .from(sessions)
      .where(inArray(sessions.leftEventId, leftIds));
    for (const row of closed) {
      if (row.leftEventId) durations.set(row.leftEventId, row.durationS);
    }
  }
  return rows.map((row) => {
    const data = row.data as Record<string, unknown>;
    const person = row.playerId !== null ? people.get(row.playerId) : undefined;
    const details: ActivityDetails = {};
    switch (row.type) {
      case 'player.level_up':
        details.from = numberOf(data.from) ?? 0;
        details.to = numberOf(data.to) ?? 0;
        break;
      case 'player.died': {
        const death = knockouts.get(row.id);
        const killer = killerOf(
          death ? death.killer : stringOf(data.killer),
          death ? death.killerKind : stringOf(data.killer_kind)
        );
        details.cause = death ? death.cause : stringOf(data.cause);
        details.killer = killer.killer;
        details.killer_kind = killer.killer_kind;
        details.killer_level = death ? death.killerLevel : numberOf(data.killer_level);
        const x = death ? death.x : numberOf(data.x);
        const y = death ? death.y : numberOf(data.y);
        if (features.positions && x !== null && y !== null) {
          details.x = x;
          details.y = y;
          details.region = regionAt(x, y);
        }
        break;
      }
      case 'player.left':
        details.session_s = durations.get(row.id) ?? null;
        break;
      case 'chat.message':
        details.channel = chatChannel(stringOf(data.channel) ?? '');
        details.text = stringOf(data.text) ?? '';
        break;
      case 'base.established':
      case 'base.removed':
        details.base_id = numberOf(data.base_id) ?? 0;
        details.base_name = baseNameOf(stringOf(data.name));
        details.guild = guildOf(data.guild_id, data.guild_name, names);
        details.x = numberOf(data.x) ?? 0;
        details.y = numberOf(data.y) ?? 0;
        details.region = regionAt(details.x, details.y);
        break;
      case 'guild.renamed':
        details.guild = guildOf(data.guild_id, data.to, names);
        details.old_name = stringOf(data.from) ?? '';
        details.new_name = stringOf(data.to) ?? '';
        break;
      case 'player.guild_joined':
        details.guild = guildOf(data.guild_id, data.guild_name, names);
        details.previous_guild = guildOf(data.previous_guild_id, data.previous_guild_name, names);
        break;
      case 'server.online':
        details.version = stringOf(data.version);
        break;
      case 'server.offline':
        details.reason = stringOf(data.reason) ?? 'unreachable';
        break;
      case 'collector.lost':
        details.last_seen_at = stringOf(data.last_seen_at) ?? row.ts.toISOString();
        break;
      case 'pal.captured':
      case 'pal.hatched': {
        const character = stringOf(data.species) ?? '';
        const species = speciesOfCharacter(character);
        details.species = species?.id ?? character;
        details.species_name = species?.name ?? null;
        details.level = numberOf(data.level);
        break;
      }
      case 'boss.defeated': {
        const kind = data.kind === 'raid' ? 'raid' : 'tower';
        details.boss = stringOf(data.boss) ?? '';
        details.boss_kind = kind;
        details.boss_name = bossName(kind, details.boss, stringOf(data.species));
        details.difficulty =
          data.difficulty === 'normal' || data.difficulty === 'hard' ? data.difficulty : null;
        break;
      }
      case 'technology.unlocked':
        details.technology = stringOf(data.technology) ?? '';
        details.technology_name = technologyName(details.technology);
        break;
    }
    return {
      id: row.id,
      type: row.type as ActivityType,
      ts: row.ts.toISOString(),
      player: person ? playerRef(person) : null,
      details
    };
  });
}

export interface ActivityQuery {
  types: ActivityType[] | null;
  playerId: number | null;
  page: KeysetPage;
}

export async function listActivity(
  db: Database,
  features: Features,
  query: ActivityQuery
): Promise<{ rows: EventRow[] }> {
  const conditions: SQL[] = [feedFilter(features, visibleTypes(features, query.types))];
  if (query.playerId !== null) conditions.push(eq(events.playerId, query.playerId));
  const after = query.page.after;
  if (after) {
    conditions.push(
      or(lt(events.ts, after.ts), and(eq(events.ts, after.ts), lt(events.id, after.id)))!
    );
  }
  const rows = await db
    .select({ event: events })
    .from(events)
    .leftJoin(players, eq(players.id, events.playerId))
    .where(and(...conditions))
    .orderBy(desc(events.ts), desc(events.id))
    .limit(query.page.limit + 1);
  return { rows: rows.map((row) => row.event) };
}

export async function feedRowsByIds(
  db: Database,
  features: Features,
  ids: string[]
): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ event: events })
    .from(events)
    .leftJoin(players, eq(players.id, events.playerId))
    .where(and(inArray(events.id, ids), feedFilter(features, visibleTypes(features, null))))
    .orderBy(asc(events.ts), asc(events.id));
  return rows.map((row) => row.event);
}

export async function feedRowsAfter(
  db: Database,
  features: Features,
  lastEventId: string,
  limit: number
): Promise<EventRow[]> {
  if (!/^[0-9a-fA-F-]{36}$/.test(lastEventId)) return [];
  const anchor = await db
    .select({ ts: events.ts, id: events.id })
    .from(events)
    .where(eq(events.id, lastEventId))
    .limit(1);
  const from = anchor[0];
  if (!from) return [];
  const rows = await db
    .select({ event: events })
    .from(events)
    .leftJoin(players, eq(players.id, events.playerId))
    .where(
      and(
        feedFilter(features, visibleTypes(features, null)),
        or(gt(events.ts, from.ts), and(eq(events.ts, from.ts), gt(events.id, from.id)))
      )
    )
    .orderBy(asc(events.ts), asc(events.id))
    .limit(limit);
  return rows.map((row) => row.event);
}
