import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { statusSamples, type ServerStatusState } from '../db/schema';
import type { Schemas } from './common';

export type StatusHistory = Schemas['StatusHistory'];
export type HistoryRange = StatusHistory['range'];

export const historyRanges: readonly HistoryRange[] = ['24h', '7d', '30d'];

export const rangeSpec: Record<HistoryRange, { spanS: number; bucketS: number }> = {
  '24h': { spanS: 24 * 3600, bucketS: 300 },
  '7d': { spanS: 7 * 24 * 3600, bucketS: 3600 },
  '30d': { spanS: 30 * 24 * 3600, bucketS: 6 * 3600 }
};

export async function statusHistory(
  db: Database,
  range: HistoryRange,
  now = new Date()
): Promise<StatusHistory> {
  const { spanS, bucketS } = rangeSpec[range];
  const from = new Date(now.getTime() - spanS * 1000);
  const interval = sql.raw(`'${Math.round(bucketS)} seconds'::interval`);
  const bucket = sql`date_bin(${interval}, ${statusSamples.ts}, 'epoch'::timestamptz)`;
  const rows = await db
    .select({
      ts: sql<Date>`${bucket}`,
      state: sql<ServerStatusState>`mode() within group (order by ${statusSamples.state})`,
      playersMax: sql<number>`max(${statusSamples.players})::int`,
      playersAvg: sql<number>`avg(${statusSamples.players})::float8`,
      fpsAvg: sql<number | null>`avg(${statusSamples.fps})::float8`
    })
    .from(statusSamples)
    .where(sql`${statusSamples.ts} >= ${from.toISOString()}::timestamptz`)
    .groupBy(bucket)
    .orderBy(bucket);
  return {
    range,
    bucket_s: bucketS,
    points: rows.map((row) => ({
      ts: new Date(row.ts).toISOString(),
      state: row.state,
      players_max: row.playersMax,
      players_avg: Math.round(row.playersAvg * 100) / 100,
      fps_avg: row.fpsAvg === null ? null : Math.round(row.fpsAvg * 10) / 10
    }))
  };
}
