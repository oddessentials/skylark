import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Job } from '$lib/api/types';
import { getDb, getJobDb } from '../db/client';
import { jobs, type JobRow } from '../db/schema';
import { conflict, notFound } from '../http/respond';
import { runBackup } from './backup';
import { rebuildProjections } from './rebuild';

export type JobKind = 'projections_rebuild' | 'backup';

const running = new Set<JobKind>();

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    kind: row.kind as JobKind,
    state: row.state as Job['state'],
    started_at: row.startedAt ? row.startedAt.toISOString() : null,
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    progress: row.progress,
    error: row.error
  };
}

async function updateJob(id: number, values: Partial<typeof jobs.$inferInsert>) {
  await getJobDb().update(jobs).set(values).where(eq(jobs.id, id));
}

async function execute(kind: JobKind, id: number, onDone: () => void) {
  try {
    await updateJob(id, { state: 'running', startedAt: new Date(), progress: 0 });
    if (kind === 'projections_rebuild') {
      await rebuildProjections(getDb(), async (done, total) => {
        await updateJob(id, { progress: total > 0 ? Math.min(1, done / total) : 1 });
      });
    } else {
      await runBackup();
    }
    await updateJob(id, { state: 'done', finishedAt: new Date(), progress: 1 });
  } catch (error) {
    await updateJob(id, {
      state: 'failed',
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error)
    }).catch(() => undefined);
  } finally {
    onDone();
  }
}

export async function startJob(kind: JobKind): Promise<{ jobId: number; finished: Promise<void> }> {
  const db = getDb();
  const active = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.kind, kind), inArray(jobs.state, ['queued', 'running'])))
    .limit(1);
  if (running.has(kind) || (active.length > 0 && running.has(kind))) {
    throw conflict(`a ${kind} job is already running`);
  }
  if (active.length > 0) {
    await db
      .update(jobs)
      .set({ state: 'failed', finishedAt: new Date(), error: 'interrupted by a restart' })
      .where(
        inArray(
          jobs.id,
          active.map((row) => row.id)
        )
      );
  }
  const inserted = await db
    .insert(jobs)
    .values({ kind, state: 'queued' })
    .returning({ id: jobs.id });
  const jobId = inserted[0]!.id;
  running.add(kind);
  const finished = execute(kind, jobId, () => running.delete(kind));
  return { jobId, finished };
}

export async function getJob(id: number): Promise<Job> {
  const rows = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw notFound(`job ${id} does not exist`);
  return toJob(row);
}

export async function latestJob(kind: JobKind): Promise<Job | null> {
  const rows = await getDb()
    .select()
    .from(jobs)
    .where(eq(jobs.kind, kind))
    .orderBy(desc(jobs.id))
    .limit(1);
  return rows[0] ? toJob(rows[0]) : null;
}

export function isRunning(kind: JobKind): boolean {
  return running.has(kind);
}
