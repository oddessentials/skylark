import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import { events, players, positions, sessions } from '../../src/lib/server/db/schema';
import { POST as ingest } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, signedRequest, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const runId = randomUUID();
let seq = 0;

async function send(type: string, data: Record<string, unknown>, at: Date): Promise<void> {
  seq += 1;
  const batch = {
    collector: { name: 'skylark-collector', version: '0.1.0', run_id: runId },
    server: {
      version: 'v1.0.5.102999',
      name: 'Presence test',
      description: '',
      world_guid: 'C0FFEE00000000000000000000000001'
    },
    events: [{ id: randomUUID(), seq, run_id: runId, ts: at.toISOString(), type, data }]
  } as IngestBatch;
  const response = await ingest(routeEvent(signedRequest(batch)));
  expect(response.status).toBe(200);
  const result = (await response.json()) as IngestResult;
  expect(result.invalid).toBe(0);
}

function snapshot(source: 'gamedata' | 'rest', entries: Record<string, unknown>[]) {
  return {
    source,
    in_game_time: '12:00',
    in_game_day: 3,
    players: entries,
    pals: [],
    palboxes: [],
    wild: []
  };
}

function person(userId: string, playerUid: string, name: string) {
  const instanceId = `${playerUid} : B${playerUid.slice(1, 8)}CCCCCCCCDDDDDDDDEEEEEEEE`;
  return {
    userId,
    playerUid,
    name,
    loaded: (level: number, x: number, y: number) => ({
      user_id: userId,
      player_id: playerUid,
      name,
      level,
      x,
      y,
      z: 7000,
      hp: 500,
      max_hp: 500,
      instance_id: instanceId,
      guild_id: null,
      guild_name: null
    }),
    loading: () => ({
      user_id: userId,
      player_id: null,
      name: '',
      level: 1,
      x: -362179,
      y: 270846,
      z: 8725,
      hp: null,
      max_hp: null,
      action: 'BP_Action_WaitLoadingWorldPartition',
      instance_id: null,
      guild_id: null,
      guild_name: null
    }),
    listed: (level: number, x: number, y: number) => ({
      user_id: userId,
      player_id: playerUid,
      name,
      level,
      x,
      y,
      hp: null,
      max_hp: null,
      instance_id: null,
      guild_id: null,
      guild_name: null
    }),
    presence: (source: 'log') => ({ user_id: userId, player_id: playerUid, name, source })
  };
}

async function playerOf(userId: string) {
  const rows = await getDb().select().from(players).where(eq(players.userId, userId));
  return rows[0] ?? null;
}

async function sessionsOf(playerId: number) {
  return getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.playerId, playerId))
    .orderBy(asc(sessions.joinedAt));
}

const second = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
});

describe('player presence from world snapshots', () => {
  it('ignores a character that is still loading or already gone, and fills the starting level', async () => {
    const wren = person('steam_76561190000000901', 'A0000901000000000000000000000000', 'Wren');
    const t0 = new Date(Date.now() - 20 * 60_000);
    await send('world.snapshot', snapshot('gamedata', [wren.loading()]), t0);
    expect(await playerOf(wren.userId)).toBeNull();
    await send('player.joined', wren.presence('log'), second(t0, 2));
    await send(
      'world.snapshot',
      snapshot('gamedata', [wren.loaded(4, -360049, 263980)]),
      second(t0, 10)
    );
    await send(
      'world.snapshot',
      snapshot('gamedata', [wren.loaded(4, -355049, 263980)]),
      second(t0, 20)
    );
    await send('player.left', wren.presence('log'), second(t0, 25));
    await send(
      'world.snapshot',
      snapshot('gamedata', [wren.listed(4, -355049, 263980)]),
      second(t0, 27)
    );
    await send('world.snapshot', snapshot('gamedata', []), second(t0, 37));

    const player = (await playerOf(wren.userId))!;
    expect(player.name).toBe('Wren');
    expect(player.level).toBe(4);
    expect(player.online).toBe(false);
    expect(player.distanceM).toBeCloseTo(50, 5);
    const rows = await sessionsOf(player.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'log',
      joinedAt: second(t0, 2),
      leftAt: second(t0, 25),
      endReason: 'left',
      levelStart: 4
    });
    expect(rows[0]!.distanceM).toBeCloseTo(50, 5);
    const samples = await getDb()
      .select()
      .from(positions)
      .where(eq(positions.playerId, player.id))
      .orderBy(asc(positions.ts));
    expect(samples.map((sample) => sample.x)).toEqual([-360049, -355049]);
    const siteJoins = await getDb()
      .select()
      .from(events)
      .where(and(eq(events.source, 'site'), eq(events.type, 'player.joined')));
    expect(siteJoins).toHaveLength(0);
  });

  it('opens sessions from REST snapshots, but not in the seconds after a leave', async () => {
    const moss = person('steam_76561190000000902', 'A0000902000000000000000000000000', 'Moss');
    const t1 = new Date(Date.now() - 10 * 60_000);
    await send('world.snapshot', snapshot('rest', [moss.listed(7, 1000, 2000)]), t1);
    await send('player.left', moss.presence('log'), second(t1, 5));
    await send('world.snapshot', snapshot('rest', [moss.listed(7, 1000, 2000)]), second(t1, 7));
    const player = (await playerOf(moss.userId))!;
    expect(player.online).toBe(false);
    expect(await sessionsOf(player.id)).toHaveLength(1);

    await send('world.snapshot', snapshot('rest', [moss.listed(7, 1500, 2000)]), second(t1, 45));
    const rows = await sessionsOf(player.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: 'site', levelStart: 7, endReason: 'left' });
    expect(rows[1]).toMatchObject({ source: 'site', joinedAt: second(t1, 45), leftAt: null });
    expect((await playerOf(moss.userId))!.online).toBe(true);
  });
});
