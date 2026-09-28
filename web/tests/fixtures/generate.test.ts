import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desc, eq } from 'drizzle-orm';
import prettier from 'prettier';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AdminHealth, StreamFrame } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import {
  actions,
  backups,
  events,
  jobs,
  players,
  sessions,
  statusSamples
} from '../../src/lib/server/db/schema';
import { ingestBatch } from '../../src/lib/server/ingest/ingest';
import { validateBatch } from '../../src/lib/server/ingest/validate';
import { toJob } from '../../src/lib/server/jobs/runner';
import {
  buildActivityItems,
  listActivity,
  type ActivityItem
} from '../../src/lib/server/read/activity';
import {
  actionsOf,
  collectorAdmin,
  listAdminEvents,
  listAdminPlayers,
  adminHealth
} from '../../src/lib/server/read/admin';
import {
  getGuild,
  getLeaderboards,
  getMap,
  getWorld,
  listChat,
  listGuilds
} from '../../src/lib/server/read/community';
import { statusHistory } from '../../src/lib/server/read/history';
import { getGuildPalpedia, getPlayerPalpedia } from '../../src/lib/server/read/palpedia';
import { getGuildPals } from '../../src/lib/server/read/pals';
import { getPlayer, getTrail, listPlayers, listSessions } from '../../src/lib/server/read/players';
import { computeOnline, computeStatus } from '../../src/lib/server/read/status';
import { defaultSettings } from '../../src/lib/server/settings';
import { generateHistory, toBatches } from '../../scripts/simulator/generator';
import { resetDatabase, useTestDatabase } from '../integration/setup';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

const root = fileURLToPath(new URL('../../fixtures/api/', import.meta.url));
const endAt = new Date('2026-09-27T20:30:00Z');
const now = new Date(endAt.getTime() + 5_000);
const features = defaultSettings.features;

async function write(name: string, document: unknown): Promise<void> {
  const file = join(root, `${name}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const text = await prettier.format(JSON.stringify(document), { parser: 'json', printWidth: 100 });
  writeFileSync(file, text);
}

function paged<T>(items: T[], limit: number, cursor: string) {
  return { items: items.slice(0, limit), next_cursor: items.length > limit ? cursor : null };
}

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
});

describe('API fixtures', () => {
  it('are generated from a simulated week run through the real ingest', async () => {
    const history = generateHistory({ days: 7, seed: 20260927, endAt });
    const db = getDb();
    for (const batch of toBatches(history)) {
      const validation = validateBatch(JSON.parse(JSON.stringify(batch)));
      expect(validation.ok).toBe(true);
      const last = batch.events[batch.events.length - 1]!;
      const receivedAt = new Date(Math.min(Date.parse(last.ts) + 1_500, now.getTime()));
      await ingestBatch(validation.batch!, validation.events, receivedAt);
    }
    const metrics = history.events.filter((event) => event.type === 'server.metrics');
    const offline = history.events.filter(
      (event) => event.type === 'server.offline' || event.type === 'server.online'
    );
    const samples: (typeof statusSamples.$inferInsert)[] = [];
    let metricIndex = 0;
    for (let ms = endAt.getTime() - 7 * 86_400_000; ms <= endAt.getTime(); ms += 300_000) {
      while (metricIndex + 1 < metrics.length && Date.parse(metrics[metricIndex + 1]!.ts) <= ms) {
        metricIndex += 1;
      }
      const lastChange = offline.filter((event) => Date.parse(event.ts) <= ms).pop();
      const down = lastChange?.type === 'server.offline';
      const metric = metrics[metricIndex]?.data as { players: number; fps: number } | undefined;
      samples.push({
        ts: new Date(ms),
        state: down ? 'offline' : 'online',
        players: down ? 0 : (metric?.players ?? 0),
        fps: down ? null : (metric?.fps ?? null)
      });
    }
    for (let start = 0; start < samples.length; start += 500) {
      await db.insert(statusSamples).values(samples.slice(start, start + 500));
    }
    const [firstPlayer] = await db
      .select()
      .from(players)
      .where(eq(players.online, true))
      .orderBy(players.id)
      .limit(1);
    await db.insert(actions).values([
      {
        kind: 'announce',
        message: 'Restart at the top of the hour',
        createdAt: new Date(now.getTime() - 3_600_000),
        deliveredAt: new Date(now.getTime() - 3_590_000),
        completedAt: new Date(now.getTime() - 3_588_000)
      },
      {
        kind: 'save',
        createdAt: new Date(now.getTime() - 600_000),
        deliveredAt: new Date(now.getTime() - 598_000),
        failedAt: new Date(now.getTime() - 597_000),
        error: 'REST answered 503'
      },
      {
        kind: 'kick',
        userId: firstPlayer!.userId,
        message: 'AFK for an hour',
        createdAt: new Date(now.getTime() - 60_000)
      }
    ]);
    const [job] = await db
      .insert(jobs)
      .values({
        kind: 'backup',
        state: 'done',
        createdAt: new Date(now.getTime() - 7_200_000),
        startedAt: new Date(now.getTime() - 7_200_000),
        finishedAt: new Date(now.getTime() - 7_195_000),
        progress: 1
      })
      .returning();
    await db.insert(backups).values([
      {
        at: new Date(now.getTime() - 7_195_000),
        file: 'skylark-2026-09-27T18-30-05Z.dump',
        sizeBytes: 4_812_331,
        ok: true
      },
      {
        at: new Date(now.getTime() - 93_595_000),
        file: 'skylark-2026-09-26T18-30-05Z.dump',
        sizeBytes: 4_530_904,
        ok: true
      }
    ]);

    rmSync(root, { recursive: true, force: true });
    const status = await computeStatus(db, now);
    const online = await computeOnline(db, features, now);
    const map = await getMap(db, features, now);
    const activityRows = await listActivity(db, features, {
      types: null,
      playerId: null,
      page: { limit: 200, after: null }
    });
    const activity = await buildActivityItems(db, activityRows.rows, features);
    expect(activity.length).toBeGreaterThan(40);
    await write('status', status);
    await write('status/history', await statusHistory(db, '24h', now));
    await write('online', online);
    await write('activity', paged(activity, 200, 'bW9yZQ'));
    const playerList = await listPlayers(db, 'last_seen', null, { limit: 200, offset: 0 }, now);
    await write('players', paged(playerList, 200, 'MjAw'));
    const featured = playerList[0]!;
    await write('players/{id}', await getPlayer(db, featured.id, features, now));
    await write(
      'players/{id}/sessions',
      paged(await listSessions(db, featured.id, { limit: 200, offset: 0 }, features), 200, 'MjAw')
    );
    await write('players/{id}/trail', await getTrail(db, featured.id, null, now));
    await write('players/{id}/palpedia', await getPlayerPalpedia(db, featured.id));
    for (const player of playerList) {
      await write(`players/${player.id}`, await getPlayer(db, player.id, features, now));
      await write(
        `players/${player.id}/sessions`,
        paged(await listSessions(db, player.id, { limit: 200, offset: 0 }, features), 200, 'MjAw')
      );
      await write(`players/${player.id}/trail`, await getTrail(db, player.id, null, now));
      await write(`players/${player.id}/palpedia`, await getPlayerPalpedia(db, player.id));
    }
    const chat = await listChat(db, features, { limit: 200, after: null });
    await write('chat', paged(chat, 200, 'bW9yZQ'));
    const guildList = await listGuilds(db, features);
    await write('guilds', { items: guildList });
    await write('guilds/{id}', await getGuild(db, guildList[0]!.id, features, now));
    await write('guilds/{id}/palpedia', await getGuildPalpedia(db, guildList[0]!.id));
    await write('guilds/{id}/pals', await getGuildPals(db, guildList[0]!.id));
    for (const guild of guildList) {
      await write(`guilds/${guild.id}`, await getGuild(db, guild.id, features, now));
      await write(`guilds/${guild.id}/palpedia`, await getGuildPalpedia(db, guild.id));
      await write(`guilds/${guild.id}/pals`, await getGuildPals(db, guild.id));
    }
    await write('map', map);
    await write('leaderboards', await getLeaderboards(db, features, now));
    await write('world', await getWorld(db, features));
    await write('site', {
      name: defaultSettings.site_name,
      version: __APP_VERSION__,
      features
    });

    await write('admin/session', {
      authenticated: true,
      expires_at: new Date(now.getTime() + 12 * 3_600_000).toISOString(),
      setup_required: false
    });
    await write('admin/settings', { ...defaultSettings, locked: [] });
    const collector = await collectorAdmin(db, now);
    await write('admin/collector', { ...collector, secret: 'mock-collector-secret-0123456789' });
    await write(
      'admin/players',
      paged(await listAdminPlayers(db, null, { limit: 200, offset: 0 }, now), 200, 'MjAw')
    );
    const actionRows = await db.select().from(actions).orderBy(desc(actions.id));
    await write('admin/actions', { items: await actionsOf(db, actionRows, now) });
    const adminEvents = await listAdminEvents(db, {
      type: null,
      invalid: null,
      playerId: null,
      page: { limit: 100, after: null }
    });
    await write('admin/events', paged(adminEvents, 100, 'bW9yZQ'));
    await write('admin/backups', {
      items: (await db.select().from(backups).orderBy(desc(backups.at))).map((row) => ({
        at: row.at.toISOString(),
        file: row.file,
        size_bytes: row.sizeBytes,
        ok: row.ok
      }))
    });
    await write('admin/jobs/{id}', toJob(job!));
    const health: AdminHealth = await adminHealth(
      db,
      [
        'collector_watchdog',
        'status_sampler',
        'retention_prune',
        'nightly_backup',
        'stream_broadcaster'
      ].map((name) => ({
        name,
        intervalMs: 60_000,
        running: false,
        runs: 12,
        skippedOverlaps: 0,
        lastRunAt: new Date(now.getTime() - 20_000).toISOString(),
        lastFinishedAt: new Date(now.getTime() - 19_000).toISOString(),
        lastOk: true,
        lastError: null
      })),
      now
    );
    await write('admin/health', {
      ...health,
      db: { ...health.db, size_mb: 42.5 },
      backup: { last_at: new Date(now.getTime() - 7_195_000).toISOString(), size_mb: 4.6, kept: 2 }
    });

    const recent = activity.slice(0, 30).reverse();
    const frames: StreamFrame[] = [
      { event: 'status', id: null, data: status },
      { event: 'online', id: null, data: online },
      { event: 'map', id: null, data: map },
      ...recent.map((item: ActivityItem): StreamFrame => ({
        event: 'activity',
        id: item.id,
        data: item
      }))
    ];
    await write('stream', frames);

    const openSessions = await db.select().from(sessions).where(eq(sessions.playerId, featured.id));
    expect(openSessions.length).toBeGreaterThan(0);
    const siteEvents = await db.select().from(events).where(eq(events.source, 'site'));
    expect(siteEvents.length).toBeGreaterThan(0);
  });
});
