import { lt } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import {
  ingestBatches,
  jobs,
  pals,
  positions,
  serverMetrics,
  snapshots,
  statusSamples
} from '../db/schema';
import { pruneSessions } from '../auth/admin';
import { siteSettings, type Retention } from '../settings';

export const fixedRetention = {
  palsDays: 30,
  ingestBatchesDays: 7,
  jobsDays: 30
} as const;

export interface PruneResult {
  positions: number;
  snapshots: number;
  serverMetrics: number;
  statusSamples: number;
  pals: number;
  ingestBatches: number;
  jobs: number;
  adminSessions: number;
}

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3600 * 1000);
const daysAgo = (now: Date, days: number) => hoursAgo(now, days * 24);

export async function runPrune(
  db: Database = getDb(),
  now = new Date(),
  retention?: Retention
): Promise<PruneResult> {
  const keep = retention ?? (await siteSettings.read(db)).retention;
  const deletedPositions =
    keep.positions_days === null
      ? []
      : await db
          .delete(positions)
          .where(lt(positions.ts, daysAgo(now, keep.positions_days)))
          .returning({ ts: positions.ts });
  const deletedSnapshots = await db
    .delete(snapshots)
    .where(lt(snapshots.receivedAt, hoursAgo(now, keep.snapshots_hours)))
    .returning({ id: snapshots.id });
  const deletedMetrics = await db
    .delete(serverMetrics)
    .where(lt(serverMetrics.ts, daysAgo(now, keep.metrics_days)))
    .returning({ ts: serverMetrics.ts });
  const deletedSamples = await db
    .delete(statusSamples)
    .where(lt(statusSamples.ts, daysAgo(now, keep.status_samples_days)))
    .returning({ ts: statusSamples.ts });
  const deletedPals = await db
    .delete(pals)
    .where(lt(pals.seenAt, daysAgo(now, fixedRetention.palsDays)))
    .returning({ id: pals.instanceId });
  const deletedBatches = await db
    .delete(ingestBatches)
    .where(lt(ingestBatches.receivedAt, daysAgo(now, fixedRetention.ingestBatchesDays)))
    .returning({ id: ingestBatches.id });
  const deletedJobs = await db
    .delete(jobs)
    .where(lt(jobs.createdAt, daysAgo(now, fixedRetention.jobsDays)))
    .returning({ id: jobs.id });
  return {
    positions: deletedPositions.length,
    snapshots: deletedSnapshots.length,
    serverMetrics: deletedMetrics.length,
    statusSamples: deletedSamples.length,
    pals: deletedPals.length,
    ingestBatches: deletedBatches.length,
    jobs: deletedJobs.length,
    adminSessions: await pruneSessions()
  };
}
