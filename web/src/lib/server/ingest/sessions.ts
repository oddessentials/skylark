import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  players,
  sessions,
  type PlayerRow,
  type SessionEndReason,
  type SessionRow
} from '../db/schema';
import { updatePlayer, type ProjectionContext } from './context';

export type SessionSource = 'log' | 'rest' | 'site';

export async function openSessionOf(
  ctx: ProjectionContext,
  player: PlayerRow
): Promise<SessionRow | null> {
  if (player.currentSessionId === null) return null;
  const rows = await ctx.tx
    .select()
    .from(sessions)
    .where(eq(sessions.id, player.currentSessionId))
    .limit(1);
  return rows[0] ?? null;
}

export interface OpenResult {
  opened: boolean;
  tookOver: boolean;
}

export async function openSession(
  ctx: ProjectionContext,
  player: PlayerRow,
  at: Date,
  source: SessionSource,
  runId: string,
  joinEventId: string | null
): Promise<OpenResult> {
  const current = await openSessionOf(ctx, player);
  if (current) {
    const tookOver = current.source === 'site' && source !== 'site';
    const patch: Partial<typeof sessions.$inferInsert> = {};
    if (at < current.joinedAt) patch.joinedAt = at;
    if (tookOver) {
      patch.source = source;
      patch.joinEventId = joinEventId;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.tx.update(sessions).set(patch).where(eq(sessions.id, current.id));
    }
    return { opened: false, tookOver };
  }
  const inserted = await ctx.tx
    .insert(sessions)
    .values({
      playerId: player.id,
      runId,
      joinedAt: at,
      source,
      joinEventId,
      levelStart: player.level > 0 ? player.level : null
    })
    .returning({ id: sessions.id });
  await updatePlayer(ctx, player, {
    online: true,
    currentSessionId: inserted[0]!.id,
    sessions: sql`${players.sessions} + 1`,
    lastSeen: player.lastSeen > at ? player.lastSeen : at
  });
  ctx.effects.onlineChanged = true;
  return { opened: true, tookOver: false };
}

export async function fillLevelStart(
  ctx: ProjectionContext,
  player: PlayerRow,
  level: number
): Promise<void> {
  if (player.currentSessionId === null || level <= 0) return;
  await ctx.tx
    .update(sessions)
    .set({ levelStart: level })
    .where(and(eq(sessions.id, player.currentSessionId), isNull(sessions.levelStart)));
}

export async function leftWithin(
  ctx: ProjectionContext,
  player: PlayerRow,
  at: Date,
  withinMs: number
): Promise<boolean> {
  const rows = await ctx.tx
    .select({ leftAt: sessions.leftAt, endReason: sessions.endReason })
    .from(sessions)
    .where(and(eq(sessions.playerId, player.id), isNotNull(sessions.leftAt)))
    .orderBy(desc(sessions.leftAt))
    .limit(1);
  const last = rows[0];
  if (!last?.leftAt || last.endReason !== 'left') return false;
  const gap = at.getTime() - last.leftAt.getTime();
  return gap >= 0 && gap < withinMs;
}

export async function closeSession(
  ctx: ProjectionContext,
  player: PlayerRow,
  at: Date,
  reason: SessionEndReason,
  leftEventId: string | null
): Promise<boolean> {
  const current = await openSessionOf(ctx, player);
  if (!current) {
    if (player.online || player.currentSessionId !== null) {
      await updatePlayer(ctx, player, { online: false, currentSessionId: null });
      ctx.effects.onlineChanged = true;
    }
    return false;
  }
  const leftAt = at > current.joinedAt ? at : current.joinedAt;
  const durationS = (leftAt.getTime() - current.joinedAt.getTime()) / 1000;
  await ctx.tx
    .update(sessions)
    .set({
      leftAt,
      durationS,
      endReason: reason,
      leftEventId,
      levelEnd: player.level > 0 ? player.level : current.levelStart
    })
    .where(eq(sessions.id, current.id));
  await updatePlayer(ctx, player, {
    online: false,
    currentSessionId: null,
    playtimeS: sql`${players.playtimeS} + ${durationS}`,
    lastSeen: player.lastSeen > leftAt ? player.lastSeen : leftAt
  });
  ctx.effects.onlineChanged = true;
  return true;
}

export async function relabelAbsentSession(
  ctx: ProjectionContext,
  player: PlayerRow,
  at: Date,
  leftEventId: string,
  windowMs: number
): Promise<boolean> {
  const rows = await ctx.tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.playerId, player.id), isNotNull(sessions.leftAt)))
    .orderBy(desc(sessions.joinedAt))
    .limit(1);
  const last = rows[0];
  if (!last || last.endReason !== 'absent' || !last.leftAt) return false;
  if (Math.abs(last.leftAt.getTime() - at.getTime()) > windowMs) return false;
  await ctx.tx
    .update(sessions)
    .set({ endReason: 'left', leftEventId })
    .where(eq(sessions.id, last.id));
  return true;
}

export async function playersWithOpenSessions(ctx: ProjectionContext): Promise<PlayerRow[]> {
  const rows = await ctx.tx.select().from(players).where(isNotNull(players.currentSessionId));
  return rows.map((row) => {
    const cached = ctx.players.get(row.userId);
    if (cached) {
      Object.assign(cached, row);
      return cached;
    }
    ctx.players.set(row.userId, row);
    return row;
  });
}

export async function closeAllSessions(
  ctx: ProjectionContext,
  at: Date,
  reason: SessionEndReason
): Promise<number> {
  let closed = 0;
  for (const player of await playersWithOpenSessions(ctx)) {
    if (await closeSession(ctx, player, at, reason, null)) closed += 1;
  }
  const stray = await ctx.tx
    .update(players)
    .set({ online: false })
    .where(and(eq(players.online, true), isNull(players.currentSessionId)))
    .returning({ id: players.id });
  if (stray.length > 0) {
    const ids = new Set(stray.map((row) => row.id));
    for (const player of ctx.players.values()) {
      if (ids.has(player.id)) player.online = false;
    }
    ctx.effects.onlineChanged = true;
  }
  return closed;
}

export async function bumpSessionCounter(
  ctx: ProjectionContext,
  player: PlayerRow,
  column: 'deaths',
  amount = 1
): Promise<void> {
  if (player.currentSessionId === null) return;
  await ctx.tx
    .update(sessions)
    .set({ [column]: sql`${sessions[column]} + ${amount}` })
    .where(eq(sessions.id, player.currentSessionId));
}
