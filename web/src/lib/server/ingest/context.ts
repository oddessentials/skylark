import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import type { PgTransaction, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { players, serverState, type PlayerRow, type ServerStateRow } from '../db/schema';

export type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type EventSource = 'collector' | 'site';

export interface StoredEvent {
  id: string;
  seq: number;
  run_id: string;
  ts: string;
  type: string;
  data: Record<string, unknown>;
  source: EventSource;
}

export interface ProjectionEffects {
  statusChanged: boolean;
  onlineChanged: boolean;
  mapChanged: boolean;
  siteEvents: StoredEvent[];
  changedEvents: string[];
}

export interface ProjectionContext {
  tx: Tx;
  receivedAt: Date;
  rebuild: boolean;
  players: Map<string, PlayerRow>;
  state: ServerStateRow | null;
  effects: ProjectionEffects;
}

export function createContext(tx: Tx, receivedAt: Date, rebuild = false): ProjectionContext {
  return {
    tx,
    receivedAt,
    rebuild,
    players: new Map(),
    state: null,
    effects: {
      statusChanged: false,
      onlineChanged: false,
      mapChanged: false,
      siteEvents: [],
      changedEvents: []
    }
  };
}

export const serverStateId = 1;

export async function loadServerState(ctx: ProjectionContext): Promise<ServerStateRow> {
  if (ctx.state) return ctx.state;
  const rows = await ctx.tx.select().from(serverState).where(eq(serverState.id, serverStateId));
  if (rows[0]) {
    ctx.state = rows[0];
    return rows[0];
  }
  const inserted = await ctx.tx
    .insert(serverState)
    .values({ id: serverStateId })
    .onConflictDoNothing()
    .returning();
  const row =
    inserted[0] ??
    (await ctx.tx.select().from(serverState).where(eq(serverState.id, serverStateId)))[0];
  if (!row) throw new Error('server state row could not be created');
  ctx.state = row;
  return row;
}

export async function updateServerState(
  ctx: ProjectionContext,
  patch: Partial<typeof serverState.$inferInsert>
): Promise<ServerStateRow> {
  await loadServerState(ctx);
  const rows = await ctx.tx
    .update(serverState)
    .set({ ...patch, updatedAt: ctx.receivedAt })
    .where(eq(serverState.id, serverStateId))
    .returning();
  ctx.state = rows[0]!;
  return ctx.state;
}

export function platformOf(userId: string): string {
  const prefix = userId.slice(0, userId.indexOf('_')).toLowerCase();
  if (prefix === 'steam' || prefix === 'gdk' || prefix === 'ps5' || prefix === 'mac') return prefix;
  return 'other';
}

export interface PlayerHints {
  name?: string | null;
  playerUid?: string | null;
  accountName?: string | null;
}

export async function findPlayer(
  ctx: ProjectionContext,
  userId: string
): Promise<PlayerRow | null> {
  const cached = ctx.players.get(userId);
  if (cached) return cached;
  const rows = await ctx.tx.select().from(players).where(eq(players.userId, userId)).limit(1);
  const row = rows[0] ?? null;
  if (row) ctx.players.set(userId, row);
  return row;
}

export async function findPlayerByUid(
  ctx: ProjectionContext,
  playerUid: string
): Promise<PlayerRow | null> {
  for (const row of ctx.players.values()) {
    if (row.playerUid === playerUid) return row;
  }
  const rows = await ctx.tx.select().from(players).where(eq(players.playerUid, playerUid)).limit(1);
  const row = rows[0] ?? null;
  if (row) ctx.players.set(row.userId, row);
  return row;
}

export type PlayerPatch = PgUpdateSetSource<typeof players>;

export async function updatePlayer(
  ctx: ProjectionContext,
  player: PlayerRow,
  patch: PlayerPatch
): Promise<PlayerRow> {
  const rows = await ctx.tx.update(players).set(patch).where(eq(players.id, player.id)).returning();
  Object.assign(player, rows[0]);
  return player;
}

function cleanName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, 64);
}

export async function resolvePlayer(
  ctx: ProjectionContext,
  userId: string,
  seenAt: Date,
  hints: PlayerHints = {}
): Promise<PlayerRow> {
  const name = cleanName(hints.name);
  const accountName = cleanName(hints.accountName);
  const playerUid = hints.playerUid ?? null;
  const existing = await findPlayer(ctx, userId);
  if (existing) {
    const patch: PlayerPatch = {};
    if (seenAt > existing.lastSeen) patch.lastSeen = seenAt;
    if (seenAt < existing.firstSeen) patch.firstSeen = seenAt;
    if (name && name !== existing.name) patch.name = name;
    if (accountName && accountName !== existing.accountName) patch.accountName = accountName;
    if (playerUid && playerUid !== existing.playerUid) patch.playerUid = playerUid;
    if (Object.keys(patch).length > 0) await updatePlayer(ctx, existing, patch);
    return existing;
  }
  const inserted = await ctx.tx
    .insert(players)
    .values({
      userId,
      playerUid,
      platform: platformOf(userId),
      name: name ?? 'Unknown player',
      accountName,
      firstSeen: seenAt,
      lastSeen: seenAt
    })
    .onConflictDoNothing()
    .returning();
  const row =
    inserted[0] ??
    (await ctx.tx.select().from(players).where(eq(players.userId, userId)).limit(1))[0];
  if (!row) throw new Error(`player ${userId} could not be created`);
  ctx.players.set(userId, row);
  if (!inserted[0]) return resolvePlayer(ctx, userId, seenAt, hints);
  return row;
}

export function parseInstant(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid timestamp ${value}`);
  return parsed;
}

export function later(a: Date | null | undefined, b: Date): Date {
  return a && a > b ? a : b;
}
