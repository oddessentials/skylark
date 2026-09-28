import { and, eq, isNull, lt } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import { collectorRuns } from '../db/schema';
import { createContext, type StoredEvent } from '../ingest/context';
import { lockProjections } from '../ingest/ingest';
import { emitSiteEvent } from '../ingest/projections';
import { collectorLostAfterSeconds } from '../read/status';

export interface WatchdogResult {
  lostRuns: string[];
  siteEvents: StoredEvent[];
}

export const processObservedSince = new Date();

export async function runWatchdog(
  db: Database = getDb(),
  now = new Date(),
  observedSince: Date = processObservedSince
): Promise<WatchdogResult> {
  const cutoff = new Date(now.getTime() - collectorLostAfterSeconds * 1000);
  const result: WatchdogResult = { lostRuns: [], siteEvents: [] };
  if (observedSince > cutoff) return result;
  const stale = await db
    .select({ runId: collectorRuns.runId })
    .from(collectorRuns)
    .where(
      and(
        isNull(collectorRuns.stoppedAt),
        isNull(collectorRuns.lostAt),
        lt(collectorRuns.lastSeenAt, cutoff)
      )
    );
  for (const { runId } of stale) {
    await db.transaction(async (tx) => {
      await lockProjections(tx);
      const rows = await tx
        .select()
        .from(collectorRuns)
        .where(eq(collectorRuns.runId, runId))
        .limit(1);
      const run = rows[0];
      if (!run || run.stoppedAt || run.lostAt || run.lastSeenAt >= cutoff) return;
      const ctx = createContext(tx, now);
      await emitSiteEvent(ctx, 'collector.lost', now, run.runId, run.lastSeq, {
        run_id: run.runId,
        last_seen_at: run.lastSeenAt.toISOString()
      });
      result.lostRuns.push(run.runId);
      result.siteEvents.push(...ctx.effects.siteEvents);
    });
  }
  return result;
}
