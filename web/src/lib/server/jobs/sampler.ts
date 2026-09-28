import { getDb, type Database } from '../db/client';
import { statusSamples } from '../db/schema';
import { computeStatus } from '../read/status';

export async function sampleStatus(db: Database = getDb(), now = new Date()): Promise<void> {
  const status = await computeStatus(db, now);
  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  await db
    .insert(statusSamples)
    .values({
      ts: minute,
      state: status.state,
      players: status.players.online,
      fps: status.performance.fps
    })
    .onConflictDoUpdate({
      target: statusSamples.ts,
      set: { state: status.state, players: status.players.online, fps: status.performance.fps }
    });
}
