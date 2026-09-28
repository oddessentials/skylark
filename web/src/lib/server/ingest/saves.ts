import { and, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import { baseSaves, guildSaves, guilds, playerSaves } from '../db/schema';
import { findPlayerByUid, parseInstant, type ProjectionContext, type StoredEvent } from './context';

type Schemas = components['schemas'];

export interface SaveOutcome {
  playerId: number | null;
  quiet: boolean;
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const newer = (table: { savedAt: unknown }) => sql`excluded.saved_at >= ${table.savedAt}`;

export async function applySavePlayer(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SavePlayerData'];
  const savedAt = parseInstant(data.saved_at);
  const values = {
    playerUid: data.player_id,
    savedAt,
    name: text(data.name),
    level: data.level ?? null,
    guildId: text(data.guild_id),
    lastOnlineAt: data.last_online_at ? parseInstant(data.last_online_at) : null,
    progress: data.progress ?? null,
    goneAt: null
  };
  await ctx.tx
    .insert(playerSaves)
    .values(values)
    .onConflictDoUpdate({
      target: playerSaves.playerUid,
      set: values,
      setWhere: newer(playerSaves)
    });
  const player = await findPlayerByUid(ctx, data.player_id);
  return { playerId: player?.id ?? null, quiet: true };
}

export async function applySaveGuild(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SaveGuildData'];
  const savedAt = parseInstant(data.saved_at);
  const values = {
    guildId: data.guild_id,
    savedAt,
    name: data.name,
    baseCampLevel: data.base_camp_level ?? null,
    members: data.members.map((member) => ({
      player_id: member.player_id,
      name: member.name,
      role: member.role
    })),
    goneAt: null
  };
  await ctx.tx
    .insert(guildSaves)
    .values(values)
    .onConflictDoUpdate({ target: guildSaves.guildId, set: values, setWhere: newer(guildSaves) });
  const name = text(data.name);
  if (name) {
    await ctx.tx
      .insert(guilds)
      .values({ id: data.guild_id, name, firstSeen: savedAt, lastSeen: savedAt })
      .onConflictDoNothing();
  }
  return { playerId: null, quiet: true };
}

export async function applySaveBase(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SaveBaseData'];
  const values = {
    baseId: data.base_id,
    savedAt: parseInstant(data.saved_at),
    guildId: text(data.guild_id),
    name: text(data.name),
    x: data.x,
    y: data.y,
    z: data.z ?? null,
    workers: data.workers.map((worker) => ({
      instance_id: worker.instance_id,
      character_id: worker.character_id,
      level: worker.level,
      name: text(worker.name)
    })),
    goneAt: null
  };
  await ctx.tx
    .insert(baseSaves)
    .values(values)
    .onConflictDoUpdate({ target: baseSaves.baseId, set: values, setWhere: newer(baseSaves) });
  ctx.effects.mapChanged = true;
  return { playerId: null, quiet: true };
}

export async function applySaveRead(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<SaveOutcome> {
  const data = event.data as unknown as Schemas['SaveReadData'];
  const savedAt = parseInstant(data.saved_at);
  const sweep = [
    { table: playerSaves, key: playerSaves.playerUid, ids: data.player_ids },
    { table: guildSaves, key: guildSaves.guildId, ids: data.guild_ids },
    { table: baseSaves, key: baseSaves.baseId, ids: data.base_ids }
  ];
  for (const { table, key, ids } of sweep) {
    const stale = and(isNull(table.goneAt), lt(table.savedAt, savedAt));
    await ctx.tx
      .update(table)
      .set({ goneAt: savedAt })
      .where(ids.length > 0 ? and(stale, notInArray(key, ids)) : stale);
    if (ids.length > 0) {
      await ctx.tx
        .update(table)
        .set({ goneAt: null })
        .where(and(inArray(key, ids), isNotNull(table.goneAt)));
    }
  }
  ctx.effects.mapChanged = true;
  return { playerId: null, quiet: true };
}
