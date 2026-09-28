import { and, asc, eq, getTableName, gt, or, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import { events, players, projectionTables, serverState } from '../db/schema';
import { createContext, type StoredEvent, type Tx } from '../ingest/context';
import { lockProjections } from '../ingest/ingest';
import { applyEvent, markEvent } from '../ingest/projections';
import { maxGapSeconds, maxSpeedMps } from '$lib/world/movement';

interface Cursor {
  ts: Date;
  seq: number;
  id: string;
}

async function nextChunk(tx: Tx, cursor: Cursor | null, size: number) {
  const after = cursor
    ? or(
        gt(events.ts, cursor.ts),
        and(eq(events.ts, cursor.ts), gt(events.seq, cursor.seq)),
        and(eq(events.ts, cursor.ts), eq(events.seq, cursor.seq), gt(events.id, cursor.id))
      )
    : undefined;
  return tx
    .select()
    .from(events)
    .where(after)
    .orderBy(asc(events.ts), asc(events.seq), asc(events.id))
    .limit(size);
}

export async function recomputeDistances(tx: Tx): Promise<void> {
  await tx.execute(sql`
    with segments as (
      select player_id, ts, x, y,
        lag(ts) over w as prev_ts, lag(x) over w as prev_x, lag(y) over w as prev_y
      from positions
      window w as (partition by player_id order by ts)
    ), valid as (
      select player_id, ts, prev_ts,
        sqrt(power(x - prev_x, 2) + power(y - prev_y, 2)) / 100.0 as meters,
        extract(epoch from (ts - prev_ts)) as secs
      from segments
      where prev_ts is not null
    ), totals as (
      select s.id, sum(v.meters) as meters
      from sessions s
      join valid v on v.player_id = s.player_id
        and v.prev_ts >= s.joined_at
        and v.ts <= coalesce(s.left_at, now())
      where v.secs > 0 and v.secs <= ${maxGapSeconds} and v.meters / v.secs <= ${maxSpeedMps}
      group by s.id
    )
    update sessions set distance_m = totals.meters from totals where totals.id = sessions.id
  `);
  await tx.execute(sql`
    update players set distance_m = coalesce(
      (select sum(distance_m) from sessions where sessions.player_id = players.id), 0)
  `);
}

export async function rebuildProjections(
  db: Database = getDb(),
  onProgress?: (done: number, total: number) => Promise<void> | void
): Promise<{ replayed: number }> {
  return db.transaction(async (tx) => {
    await lockProjections(tx);
    const totals = await tx.select({ count: sql<number>`count(*)::int` }).from(events);
    const total = totals[0]?.count ?? 0;
    for (const table of projectionTables) {
      await tx.execute(sql`delete from ${table}`);
      await tx.execute(
        sql.raw(`alter sequence if exists "${getTableName(table)}_id_seq" restart with 1`)
      );
    }
    await tx.update(players).set({
      online: false,
      currentSessionId: null,
      playtimeS: 0,
      sessions: 0,
      deaths: 0,
      chatMessages: 0,
      distanceM: 0
    });
    await tx
      .update(serverState)
      .set({ online: false, onlineSince: null, offlineSince: null, playerCount: 0 });
    await tx.update(events).set({ playerId: null, quiet: false });
    const ctx = createContext(tx, new Date(), true);
    let cursor: Cursor | null = null;
    let replayed = 0;
    for (;;) {
      const chunk = await nextChunk(tx, cursor, 500);
      if (chunk.length === 0) break;
      for (const row of chunk) {
        replayed += 1;
        if (row.invalid !== null) continue;
        const event: StoredEvent = {
          id: row.id,
          seq: row.seq,
          run_id: row.runId,
          ts: row.ts.toISOString(),
          type: row.type,
          data: row.data as Record<string, unknown>,
          source: row.source === 'site' ? 'site' : 'collector'
        };
        ctx.receivedAt = row.receivedAt;
        await markEvent(ctx, row.id, await applyEvent(ctx, event));
      }
      const last = chunk[chunk.length - 1]!;
      cursor = { ts: last.ts, seq: last.seq, id: last.id };
      if (onProgress) await onProgress(replayed, total);
    }
    await recomputeDistances(tx);
    return { replayed };
  });
}
