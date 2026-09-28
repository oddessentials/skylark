import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/lib/server/db/client';
import { players, positions, serverMetrics, statusSamples } from '../../src/lib/server/db/schema';
import { runPrune } from '../../src/lib/server/jobs/prune';
import { defaultSettings, siteSettings } from '../../src/lib/server/settings';
import { resetDatabase, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const now = new Date('2026-09-28T06:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
  const db = getDb();
  const [player] = await db
    .insert(players)
    .values({
      userId: 'steam_76561190000000101',
      platform: 'steam',
      name: 'Wanderer',
      firstSeen: daysAgo(400),
      lastSeen: now
    })
    .returning();
  await db.insert(positions).values(
    [400, 100, 10, 1].map((days) => ({
      playerId: player!.id,
      ts: daysAgo(days),
      x: days,
      y: days
    }))
  );
  await db.insert(serverMetrics).values(
    [40, 20].map((days) => ({
      ts: daysAgo(days),
      fps: 60,
      frameTimeMs: 16.6,
      players: 1,
      maxPlayers: 32,
      days: 1,
      baseCamps: 0,
      uptimeS: 60
    }))
  );
  await db
    .insert(statusSamples)
    .values([100, 50].map((days) => ({ ts: daysAgo(days), state: 'online' as const, players: 1 })));
});

const count = async (table: typeof positions | typeof serverMetrics | typeof statusSamples) =>
  (
    await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
  )[0]!.n;

describe('retention', () => {
  it('keeps positions forever by default and prunes the rest by the defaults', async () => {
    const result = await runPrune(getDb(), now);
    expect(result.positions).toBe(0);
    expect(await count(positions)).toBe(4);
    expect(result.serverMetrics).toBe(1);
    expect(await count(serverMetrics)).toBe(1);
    expect(result.statusSamples).toBe(1);
    expect(await count(statusSamples)).toBe(1);
  });

  it('prunes positions once the admin sets a period', async () => {
    await siteSettings.write({ retention: { positions_days: 30, metrics_days: 7 } });
    const stored = await siteSettings.read();
    expect(stored.retention).toEqual({
      ...defaultSettings.retention,
      positions_days: 30,
      metrics_days: 7
    });
    const result = await runPrune(getDb(), now);
    expect(result.positions).toBe(2);
    expect(await count(positions)).toBe(2);
    expect(result.serverMetrics).toBe(1);
    expect(await count(serverMetrics)).toBe(0);
  });
});
