import { and, desc, eq, sql } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import {
  bases,
  guildMembers,
  guilds,
  meta,
  pals,
  players,
  positions,
  sessions,
  worldLive,
  type BaseRow,
  type PlayerRow
} from '../db/schema';
import {
  findPlayerByUid,
  later,
  loadServerState,
  parseInstant,
  resolvePlayer,
  updatePlayer,
  updateServerState,
  type ProjectionContext,
  type StoredEvent
} from './context';
import { emitSiteEvent } from './projections';
import { openSessionOf, playersWithOpenSessions } from './sessions';
import { segmentMeters } from '$lib/world/movement';

type Schemas = components['schemas'];
type SnapshotData = Schemas['WorldSnapshotData'];
type SnapshotPlayer = Schemas['SnapshotPlayer'];
type SnapshotPal = Schemas['SnapshotPal'];

export const positionSampleMs = 10_000;
export const stationarySampleMs = 60_000;
export const stationaryMeters = 1;
export const absentAfterMs = 90_000;
export const baseGoneAfterMs = 60_000;
export const baselineKey = 'world.baseline_at';
export const settleMs = 5 * 60_000;

export function baseKey(x: number, y: number): string {
  return `${Math.round(x / 10)}:${Math.round(y / 10)}`;
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

interface SnapshotScope {
  ctx: ProjectionContext;
  event: StoredEvent;
  ts: Date;
}

async function samplePosition(
  scope: SnapshotScope,
  player: PlayerRow,
  entry: SnapshotPlayer
): Promise<void> {
  const { ctx, ts } = scope;
  const rows = await ctx.tx
    .select()
    .from(positions)
    .where(eq(positions.playerId, player.id))
    .orderBy(desc(positions.ts))
    .limit(1);
  const last = rows[0];
  if (last) {
    const elapsedMs = ts.getTime() - last.ts.getTime();
    if (elapsedMs < positionSampleMs) return;
    const moved = Math.hypot(entry.x - last.x, entry.y - last.y) / 100;
    if (moved < stationaryMeters && elapsedMs < stationarySampleMs) return;
  }
  await ctx.tx
    .insert(positions)
    .values({ playerId: player.id, ts, x: entry.x, y: entry.y, z: entry.z ?? null })
    .onConflictDoNothing();
  if (!last) return;
  const session = await openSessionOf(ctx, player);
  if (!session || last.ts < session.joinedAt) return;
  const meters = segmentMeters(
    { x: last.x, y: last.y, seconds: last.ts.getTime() / 1000 },
    { x: entry.x, y: entry.y, seconds: ts.getTime() / 1000 }
  );
  if (meters <= 0) return;
  await updatePlayer(ctx, player, { distanceM: sql`${players.distanceM} + ${meters}` });
  await ctx.tx
    .update(sessions)
    .set({ distanceM: sql`${sessions.distanceM} + ${meters}` })
    .where(eq(sessions.id, session.id));
}

async function touchGuild(
  scope: SnapshotScope,
  guildId: string,
  name: string | null
): Promise<string> {
  const { ctx, event, ts } = scope;
  const rows = await ctx.tx.select().from(guilds).where(eq(guilds.id, guildId)).limit(1);
  const existing = rows[0];
  if (!existing) {
    const created = name ?? 'Guild';
    await ctx.tx
      .insert(guilds)
      .values({ id: guildId, name: created, firstSeen: ts, lastSeen: ts })
      .onConflictDoNothing();
    return created;
  }
  const renamed = name !== null && name !== existing.name;
  await ctx.tx
    .update(guilds)
    .set({ lastSeen: later(existing.lastSeen, ts), ...(renamed ? { name } : {}) })
    .where(eq(guilds.id, guildId));
  if (renamed) {
    await emitSiteEvent(ctx, 'guild.renamed', ts, event.run_id, event.seq, {
      guild_id: guildId,
      from: existing.name,
      to: name
    });
    return name;
  }
  return existing.name;
}

async function applyMembership(
  scope: SnapshotScope,
  player: PlayerRow,
  guildId: string | null,
  guildName: string | null
): Promise<void> {
  if (!guildId) return;
  const { ctx, event, ts } = scope;
  const name = await touchGuild(scope, guildId, guildName);
  const previous = player.guildId;
  if (previous === guildId) {
    await ctx.tx
      .update(guildMembers)
      .set({ lastSeen: ts, current: true })
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.playerId, player.id)));
    return;
  }
  let previousName: string | null = null;
  if (previous) {
    await ctx.tx
      .update(guildMembers)
      .set({ current: false })
      .where(and(eq(guildMembers.guildId, previous), eq(guildMembers.playerId, player.id)));
    const rows = await ctx.tx
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, previous))
      .limit(1);
    previousName = rows[0]?.name ?? null;
  }
  await ctx.tx
    .insert(guildMembers)
    .values({ guildId, playerId: player.id, firstSeen: ts, lastSeen: ts, current: true })
    .onConflictDoUpdate({
      target: [guildMembers.guildId, guildMembers.playerId],
      set: { lastSeen: ts, current: true }
    });
  await updatePlayer(ctx, player, { guildId });
  if (previous) {
    await emitSiteEvent(ctx, 'player.guild_joined', ts, event.run_id, event.seq, {
      user_id: player.userId,
      name: player.name,
      guild_id: guildId,
      guild_name: name,
      previous_guild_id: previous,
      previous_guild_name: previousName
    });
  }
}

async function applyPlayers(
  scope: SnapshotScope,
  data: SnapshotData
): Promise<Map<string, PlayerRow>> {
  const { ctx, event, ts } = scope;
  const seen = new Map<string, PlayerRow>();
  for (const entry of data.players) {
    if (seen.has(entry.user_id)) continue;
    const player = await resolvePlayer(ctx, entry.user_id, ts, {
      name: entry.name,
      playerUid: entry.player_id,
      accountName: entry.account_name ?? null
    });
    seen.set(entry.user_id, player);
    await updatePlayer(ctx, player, {
      level: entry.level > 0 ? entry.level : player.level,
      hp: entry.hp ?? null,
      maxHp: entry.max_hp ?? null,
      action: text(entry.action),
      lastX: entry.x,
      lastY: entry.y,
      lastZ: entry.z ?? null,
      positionAt: ts
    });
    if (player.currentSessionId === null) {
      await emitSiteEvent(ctx, 'player.joined', ts, event.run_id, event.seq, {
        user_id: entry.user_id,
        player_id: entry.player_id,
        name: player.name,
        source: 'site'
      });
    }
    await samplePosition(scope, player, entry);
    await applyMembership(scope, player, text(entry.guild_id), text(entry.guild_name));
  }
  return seen;
}

async function closeAbsentPlayers(
  scope: SnapshotScope,
  seen: Map<string, PlayerRow>
): Promise<void> {
  const { ctx, event, ts } = scope;
  for (const player of await playersWithOpenSessions(ctx)) {
    if (seen.has(player.userId)) continue;
    const session = await openSessionOf(ctx, player);
    if (!session) continue;
    const lastSeen =
      player.positionAt && player.positionAt > session.joinedAt
        ? player.positionAt
        : session.joinedAt;
    if (ts.getTime() - lastSeen.getTime() < absentAfterMs) continue;
    await emitSiteEvent(ctx, 'player.left', lastSeen, event.run_id, event.seq, {
      user_id: player.userId,
      player_id: player.playerUid,
      name: player.name,
      source: 'site',
      reason: 'absent'
    });
  }
}

async function worldBaseline(ctx: ProjectionContext, ts: Date): Promise<Date> {
  const rows = await ctx.tx.select().from(meta).where(eq(meta.key, baselineKey)).limit(1);
  const stored = rows[0] ? new Date(rows[0].value) : null;
  if (stored && !Number.isNaN(stored.getTime())) return stored;
  await ctx.tx
    .insert(meta)
    .values({ key: baselineKey, value: ts.toISOString(), updatedAt: ts })
    .onConflictDoNothing();
  return ts;
}

async function settling(ctx: ProjectionContext, ts: Date): Promise<boolean> {
  const baselineAt = await worldBaseline(ctx, ts);
  if (ts.getTime() - baselineAt.getTime() < settleMs) return true;
  const state = await loadServerState(ctx);
  if (state.onlineSince && ts.getTime() - state.onlineSince.getTime() < settleMs) return true;
  return state.uptimeS !== null && state.uptimeS * 1000 < settleMs;
}

function baseEventData(row: BaseRow, guildName: string | null): Record<string, unknown> {
  return {
    base_id: row.id,
    guild_id: row.guildId,
    guild_name: guildName,
    name: row.name,
    x: row.x,
    y: row.y,
    z: row.z
  };
}

async function applyPalboxes(scope: SnapshotScope, data: SnapshotData): Promise<BaseRow[]> {
  const { ctx, event, ts } = scope;
  const quiet = await settling(ctx, ts);
  const existing = new Map((await ctx.tx.select().from(bases)).map((row) => [row.key, row]));
  const present = new Map<string, BaseRow>();
  for (const box of data.palboxes) {
    const key = baseKey(box.x, box.y);
    if (present.has(key)) continue;
    const guildId = text(box.guild_id);
    const guildName = guildId ? await touchGuild(scope, guildId, text(box.guild_name)) : null;
    const name = text(box.name);
    const before = existing.get(key);
    if (!before) {
      const inserted = await ctx.tx
        .insert(bases)
        .values({
          key,
          guildId,
          name,
          x: box.x,
          y: box.y,
          z: box.z ?? null,
          firstSeen: ts,
          lastSeen: ts
        })
        .returning();
      const row = inserted[0]!;
      present.set(key, row);
      if (guildId && !quiet) {
        await emitSiteEvent(
          ctx,
          'base.established',
          ts,
          event.run_id,
          event.seq,
          baseEventData(row, guildName)
        );
      }
      continue;
    }
    const updated = await ctx.tx
      .update(bases)
      .set({
        guildId: guildId ?? before.guildId,
        name: name ?? before.name,
        x: box.x,
        y: box.y,
        z: box.z ?? null,
        lastSeen: later(before.lastSeen, ts),
        goneAt: null
      })
      .where(eq(bases.id, before.id))
      .returning();
    const row = updated[0]!;
    present.set(key, row);
    const established = (before.goneAt !== null || before.guildId === null) && guildId !== null;
    if (established && !quiet) {
      await emitSiteEvent(
        ctx,
        'base.established',
        ts,
        event.run_id,
        event.seq,
        baseEventData(row, guildName)
      );
    }
  }
  for (const row of existing.values()) {
    if (quiet || present.has(row.key) || row.goneAt !== null) continue;
    if (ts.getTime() - row.lastSeen.getTime() < baseGoneAfterMs) continue;
    await ctx.tx.update(bases).set({ goneAt: ts }).where(eq(bases.id, row.id));
    if (row.guildId) {
      const names = await ctx.tx
        .select({ name: guilds.name })
        .from(guilds)
        .where(eq(guilds.id, row.guildId))
        .limit(1);
      await emitSiteEvent(
        ctx,
        'base.removed',
        ts,
        event.run_id,
        event.seq,
        baseEventData(row, names[0]?.name ?? null)
      );
    }
  }
  return [...present.values()];
}

function nearestBase(pal: SnapshotPal, candidates: BaseRow[]): BaseRow | null {
  let best: BaseRow | null = null;
  let bestDistance = Infinity;
  for (const base of candidates) {
    if (base.guildId !== pal.guild_id) continue;
    const distance = Math.hypot(base.x - pal.x, base.y - pal.y);
    if (distance < bestDistance) {
      best = base;
      bestDistance = distance;
    }
  }
  return best;
}

async function applyPals(
  scope: SnapshotScope,
  data: SnapshotData,
  seen: Map<string, PlayerRow>,
  present: BaseRow[]
): Promise<void> {
  const { ctx, ts } = scope;
  const owners = new Map<string, number | null>();
  for (const player of seen.values()) {
    if (player.playerUid) owners.set(player.playerUid, player.id);
  }
  const workers = new Map<number, number>();
  const rows: (typeof pals.$inferInsert)[] = [];
  const unique = new Set<string>();
  for (const pal of data.pals) {
    if (unique.has(pal.instance_id)) continue;
    unique.add(pal.instance_id);
    let ownerId: number | null = null;
    if (pal.owner_player_id) {
      if (!owners.has(pal.owner_player_id)) {
        owners.set(
          pal.owner_player_id,
          (await findPlayerByUid(ctx, pal.owner_player_id))?.id ?? null
        );
      }
      ownerId = owners.get(pal.owner_player_id) ?? null;
    }
    const base = pal.kind === 'base' ? nearestBase(pal, present) : null;
    if (base) workers.set(base.id, (workers.get(base.id) ?? 0) + 1);
    rows.push({
      instanceId: pal.instance_id,
      kind: pal.kind,
      className: pal.class,
      name: text(pal.name),
      level: pal.level,
      hp: pal.hp ?? null,
      maxHp: pal.max_hp ?? null,
      ownerPlayerId: ownerId,
      guildId: text(pal.guild_id),
      baseId: base?.id ?? null,
      action: text(pal.action) ?? text(pal.ai_action),
      x: pal.x,
      y: pal.y,
      z: pal.z ?? null,
      firstSeen: ts,
      seenAt: ts
    });
  }
  for (let start = 0; start < rows.length; start += 200) {
    await ctx.tx
      .insert(pals)
      .values(rows.slice(start, start + 200))
      .onConflictDoUpdate({
        target: pals.instanceId,
        set: {
          kind: sql`excluded.kind`,
          className: sql`excluded.class_name`,
          name: sql`excluded.name`,
          level: sql`excluded.level`,
          hp: sql`excluded.hp`,
          maxHp: sql`excluded.max_hp`,
          ownerPlayerId: sql`coalesce(excluded.owner_player_id, ${pals.ownerPlayerId})`,
          guildId: sql`coalesce(excluded.guild_id, ${pals.guildId})`,
          baseId: sql`excluded.base_id`,
          action: sql`excluded.action`,
          x: sql`excluded.x`,
          y: sql`excluded.y`,
          z: sql`excluded.z`,
          seenAt: sql`excluded.seen_at`
        }
      });
  }
  for (const [baseId, count] of workers) {
    await ctx.tx
      .update(bases)
      .set({ workers: count, workersSeenAt: ts })
      .where(eq(bases.id, baseId));
  }
}

export async function applySnapshot(ctx: ProjectionContext, event: StoredEvent): Promise<boolean> {
  const ts = parseInstant(event.ts);
  const state = await loadServerState(ctx);
  if (state.snapshotAt && ts <= state.snapshotAt) return false;
  const data = event.data as unknown as SnapshotData;
  const scope: SnapshotScope = { ctx, event, ts };
  const clock = data.in_game_time
    ? { inGameTime: data.in_game_time, inGameDay: data.in_game_day ?? null, inGameAt: ts }
    : {};
  await updateServerState(ctx, { snapshotAt: ts, snapshotSource: data.source, ...clock });
  const seen = await applyPlayers(scope, data);
  await closeAbsentPlayers(scope, seen);
  if (data.source === 'gamedata') {
    const present = await applyPalboxes(scope, data);
    await applyPals(scope, data, seen, present);
    const wild = data.wild as unknown as Record<string, unknown>[];
    await ctx.tx
      .insert(worldLive)
      .values({ id: 1, snapshotAt: ts, wild })
      .onConflictDoUpdate({ target: worldLive.id, set: { snapshotAt: ts, wild } });
  }
  ctx.effects.mapChanged = true;
  return true;
}
