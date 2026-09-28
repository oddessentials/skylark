import { lt } from 'drizzle-orm';
import { getDb, type Database } from '../db/client';
import { ingestBatches, jobs, pals, serverMetrics, snapshots, statusSamples } from '../db/schema';
import { pruneSessions } from '../auth/admin';

export const retention = {
  snapshotsHours: 1,
  serverMetricsDays: 30,
  statusSamplesDays: 90,
  palsDays: 30,
  ingestBatchesDays: 7,
  jobsDays: 30
} as const;

export interface PruneResult {
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

export async function runPrune(db: Database = getDb(), now = new Date()): Promise<PruneResult> {
  const deletedSnapshots = await db
    .delete(snapshots)
    .where(lt(snapshots.receivedAt, hoursAgo(now, retention.snapshotsHours)))
    .returning({ id: snapshots.id });
  const deletedMetrics = await db
    .delete(serverMetrics)
    .where(lt(serverMetrics.ts, daysAgo(now, retention.serverMetricsDays)))
    .returning({ ts: serverMetrics.ts });
  const deletedSamples = await db
    .delete(statusSamples)
    .where(lt(statusSamples.ts, daysAgo(now, retention.statusSamplesDays)))
    .returning({ ts: statusSamples.ts });
  const deletedPals = await db
    .delete(pals)
    .where(lt(pals.seenAt, daysAgo(now, retention.palsDays)))
    .returning({ id: pals.instanceId });
  const deletedBatches = await db
    .delete(ingestBatches)
    .where(lt(ingestBatches.receivedAt, daysAgo(now, retention.ingestBatchesDays)))
    .returning({ id: ingestBatches.id });
  const deletedJobs = await db
    .delete(jobs)
    .where(lt(jobs.createdAt, daysAgo(now, retention.jobsDays)))
    .returning({ id: jobs.id });
  return {
    snapshots: deletedSnapshots.length,
    serverMetrics: deletedMetrics.length,
    statusSamples: deletedSamples.length,
    pals: deletedPals.length,
    ingestBatches: deletedBatches.length,
    jobs: deletedJobs.length,
    adminSessions: await pruneSessions()
  };
}
