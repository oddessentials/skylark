import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import { getDb } from '../db/client';
import {
  actions,
  collectorRuns,
  events,
  ingestBatches,
  snapshots,
  type ActionRow
} from '../db/schema';
import {
  createContext,
  loadServerState,
  parseInstant,
  updateServerState,
  type ProjectionContext,
  type ProjectionEffects,
  type StoredEvent,
  type Tx
} from './context';
import { applyEvent, applyHeartbeat, applyMetrics, markEvent } from './projections';
import type { CheckedEvent, IncomingBatch } from './validate';
import { applySnapshot } from './world';

export type CollectorAction = components['schemas']['CollectorAction'];

export const maxBatchBytes = 512 * 1024;
export const actionRedeliveryMs = 5 * 60_000;
export const projectionLockKey = 5_247_047;

export interface IngestOutcome {
  accepted: number;
  duplicates: number;
  invalid: number;
  lastSeq: number | null;
  stored: StoredEvent[];
  effects: ProjectionEffects;
  actions: CollectorAction[];
}

export async function lockProjections(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${projectionLockKey})`);
}

async function touchRun(
  ctx: ProjectionContext,
  batch: IncomingBatch,
  firstTs: Date | null
): Promise<void> {
  const collector = batch.collector;
  await ctx.tx
    .insert(collectorRuns)
    .values({
      runId: collector.run_id,
      startedAt: firstTs && firstTs < ctx.receivedAt ? firstTs : ctx.receivedAt,
      lastSeenAt: ctx.receivedAt,
      collectorName: collector.name,
      collectorVersion: collector.version,
      os: collector.os ?? null,
      arch: collector.arch ?? null
    })
    .onConflictDoUpdate({
      target: collectorRuns.runId,
      set: {
        lastSeenAt: sql`greatest(${collectorRuns.lastSeenAt}, ${ctx.receivedAt.toISOString()}::timestamptz)`,
        lostAt: null,
        collectorName: collector.name,
        collectorVersion: collector.version
      }
    });
}

async function rememberServer(ctx: ProjectionContext, batch: IncomingBatch): Promise<void> {
  const server = batch.server;
  if (!server) return;
  const state = await loadServerState(ctx);
  const description = server.description ?? null;
  if (
    state.serverVersion === server.version &&
    state.serverName === server.name &&
    state.serverDescription === description &&
    state.worldGuid === server.world_guid
  ) {
    return;
  }
  await updateServerState(ctx, {
    serverVersion: server.version,
    serverName: server.name,
    serverDescription: description,
    worldGuid: server.world_guid
  });
  ctx.effects.statusChanged = true;
}

function ordered(checked: CheckedEvent[]): CheckedEvent[] {
  const runOrder = new Map<string, number>();
  for (const item of checked) {
    if (!runOrder.has(item.event.run_id)) runOrder.set(item.event.run_id, runOrder.size);
  }
  return [...checked].sort(
    (a, b) =>
      (runOrder.get(a.event.run_id) ?? 0) - (runOrder.get(b.event.run_id) ?? 0) ||
      a.event.seq - b.event.seq
  );
}

async function storeEvent(
  ctx: ProjectionContext,
  event: StoredEvent,
  invalid: string | null
): Promise<boolean> {
  const inserted = await ctx.tx
    .insert(events)
    .values({
      id: event.id,
      runId: event.run_id,
      seq: event.seq,
      type: event.type,
      ts: parseInstant(event.ts),
      receivedAt: ctx.receivedAt,
      data: event.data,
      source: 'collector',
      invalid
    })
    .onConflictDoNothing()
    .returning({ id: events.id });
  return inserted.length > 0;
}

async function storeSnapshot(ctx: ProjectionContext, event: StoredEvent): Promise<boolean> {
  const inserted = await ctx.tx
    .insert(snapshots)
    .values({
      id: event.id,
      runId: event.run_id,
      seq: event.seq,
      ts: parseInstant(event.ts),
      receivedAt: ctx.receivedAt,
      data: event.data
    })
    .onConflictDoNothing()
    .returning({ id: snapshots.id });
  return inserted.length > 0;
}

export function toCollectorAction(row: ActionRow): CollectorAction {
  return {
    id: row.id,
    kind: row.kind,
    message: row.message,
    user_id: row.userId,
    waittime_s: row.waittimeS
  };
}

export async function pendingActions(tx: Tx, now: Date): Promise<CollectorAction[]> {
  const redeliverAfter = new Date(now.getTime() - actionRedeliveryMs);
  const rows = await tx
    .select()
    .from(actions)
    .where(
      and(
        isNull(actions.cancelledAt),
        isNull(actions.completedAt),
        isNull(actions.failedAt),
        or(isNull(actions.notBefore), lte(actions.notBefore, now)),
        or(isNull(actions.deliveredAt), gt(actions.deliveredAt, redeliverAfter))
      )
    )
    .orderBy(asc(actions.id));
  const fresh = rows.filter((row) => row.deliveredAt === null).map((row) => row.id);
  if (fresh.length > 0) {
    await tx.update(actions).set({ deliveredAt: now }).where(inArray(actions.id, fresh));
  }
  return rows.map(toCollectorAction);
}

export async function applyBatchInTransaction(
  tx: Tx,
  batch: IncomingBatch,
  checked: CheckedEvent[],
  receivedAt: Date
): Promise<IngestOutcome> {
  await lockProjections(tx);
  const ctx = createContext(tx, receivedAt);
  const times = checked.map((item) => parseInstant(item.event.ts).getTime());
  await touchRun(ctx, batch, times.length > 0 ? new Date(Math.min(...times)) : null);
  await rememberServer(ctx, batch);
  const stored: StoredEvent[] = [];
  const lastSeqs = new Map<string, number>();
  let accepted = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const item of ordered(checked)) {
    const event: StoredEvent = { ...item.event, source: 'collector' };
    lastSeqs.set(event.run_id, Math.max(lastSeqs.get(event.run_id) ?? 0, event.seq));
    if (!item.known || item.invalid) {
      if (await storeEvent(ctx, event, item.invalid)) {
        accepted += 1;
        if (item.invalid) invalid += 1;
      } else {
        duplicates += 1;
      }
      continue;
    }
    if (event.type === 'world.snapshot') {
      if (await storeSnapshot(ctx, event)) {
        accepted += 1;
        await applySnapshot(ctx, event);
      } else {
        duplicates += 1;
      }
      continue;
    }
    if (event.type === 'server.metrics') {
      if (await applyMetrics(ctx, event)) accepted += 1;
      else duplicates += 1;
      continue;
    }
    if (event.type === 'collector.heartbeat') {
      if (await applyHeartbeat(ctx, event)) accepted += 1;
      else duplicates += 1;
      continue;
    }
    if (!(await storeEvent(ctx, event, null))) {
      duplicates += 1;
      continue;
    }
    accepted += 1;
    await markEvent(ctx, event.id, await applyEvent(ctx, event));
    stored.push(event);
  }
  for (const [runId, seq] of lastSeqs) {
    await tx
      .update(collectorRuns)
      .set({ lastSeq: sql`greatest(${collectorRuns.lastSeq}, ${seq})` })
      .where(eq(collectorRuns.runId, runId));
  }
  return {
    accepted,
    duplicates,
    invalid,
    lastSeq: lastSeqs.get(batch.collector.run_id) ?? null,
    stored,
    effects: ctx.effects,
    actions: await pendingActions(tx, receivedAt)
  };
}

export async function ingestBatch(
  batch: IncomingBatch,
  checked: CheckedEvent[],
  receivedAt = new Date()
): Promise<IngestOutcome> {
  const db = getDb();
  const outcome = await db.transaction((tx) =>
    applyBatchInTransaction(tx, batch, checked, receivedAt)
  );
  await db.insert(ingestBatches).values({
    receivedAt,
    status: 200,
    accepted: outcome.accepted,
    duplicates: outcome.duplicates,
    invalid: outcome.invalid,
    events: checked.length
  });
  return outcome;
}

export async function recordRejectedBatch(status: number, receivedAt = new Date()): Promise<void> {
  try {
    await getDb()
      .insert(ingestBatches)
      .values({ receivedAt, status, accepted: 0, duplicates: 0, invalid: 0, events: 0 });
  } catch (error) {
    console.error('ingest: could not record the rejected batch', error);
  }
}

export async function ingestStats(since: Date) {
  const rows = await getDb()
    .select({
      batches: sql<number>`count(*) filter (where ${ingestBatches.status} = 200)::int`,
      events: sql<number>`coalesce(sum(${ingestBatches.accepted}), 0)::int`,
      duplicates: sql<number>`coalesce(sum(${ingestBatches.duplicates}), 0)::int`,
      invalid: sql<number>`coalesce(sum(${ingestBatches.invalid}), 0)::int`,
      rejected: sql<number>`count(*) filter (where ${ingestBatches.status} <> 200)::int`,
      lastBatchAt: sql<Date | null>`max(${ingestBatches.receivedAt}) filter (where ${ingestBatches.status} = 200)`
    })
    .from(ingestBatches)
    .where(sql`${ingestBatches.receivedAt} >= ${since.toISOString()}::timestamptz`);
  const row = rows[0];
  return {
    batches: row?.batches ?? 0,
    events: row?.events ?? 0,
    duplicates: row?.duplicates ?? 0,
    invalid: row?.invalid ?? 0,
    rejected: row?.rejected ?? 0,
    lastBatchAt: row?.lastBatchAt ? new Date(row.lastBatchAt) : null
  };
}
