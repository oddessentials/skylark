import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import { deaths, events, feats, players } from '../../src/lib/server/db/schema';
import { rebuildProjections } from '../../src/lib/server/jobs/rebuild';
import { buildActivityItems, listActivity } from '../../src/lib/server/read/activity';
import { getPlayer } from '../../src/lib/server/read/players';
import { defaultSettings } from '../../src/lib/server/settings';
import { POST as ingest } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, signedRequest, useTestDatabase } from './setup';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const runId = randomUUID();
let seq = 0;

async function send(type: string, data: Record<string, unknown>, at: Date): Promise<string> {
  seq += 1;
  const id = randomUUID();
  const batch = {
    collector: { name: 'skylark-collector', version: '0.1.0', run_id: runId },
    server: {
      version: 'v1.0.5.102999',
      name: 'Mod test',
      description: '',
      world_guid: 'C0FFEE00000000000000000000000002'
    },
    events: [{ id, seq, run_id: runId, ts: at.toISOString(), type, data }]
  } as IngestBatch;
  const response = await ingest(routeEvent(signedRequest(batch)));
  expect(response.status).toBe(200);
  const result = (await response.json()) as IngestResult;
  expect(result.invalid).toBe(0);
  return id;
}

const moss = {
  user_id: 'steam_76561190000000951',
  player_id: 'A0000951000000000000000000000000',
  name: 'Moss'
};

const second = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

async function mossRow() {
  const rows = await getDb().select().from(players).where(eq(players.userId, moss.user_id));
  return rows[0]!;
}

async function knockoutsOf(playerId: number) {
  return getDb()
    .select()
    .from(deaths)
    .where(eq(deaths.playerId, playerId))
    .orderBy(asc(deaths.at), asc(deaths.id));
}

async function feedItem(eventId: string) {
  const rows = await getDb().select().from(events).where(eq(events.id, eventId));
  const [item] = await buildActivityItems(getDb(), rows, defaultSettings.features);
  return item!;
}

const t0 = new Date(Date.now() - 60 * 60_000);

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
  await send('player.joined', { ...moss, source: 'log' }, t0);
});

describe('events from the server mod', () => {
  it('merges a mod knockout with the snapshot knockout of the same moment, in either order', async () => {
    const snapshotFirst = await send(
      'player.died',
      { ...moss, x: -346912, y: 261690, z: 5000, source: 'snapshot' },
      second(t0, 60)
    );
    const modSecond = await send(
      'player.died',
      {
        ...moss,
        x: -346000,
        y: 261000,
        source: 'mod',
        cause: 'attack',
        killer: 'BOSS_SheepBall',
        killer_kind: 'character',
        killer_level: 12
      },
      second(t0, 68)
    );
    const player = await mossRow();
    let rows = await knockoutsOf(player.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventId: snapshotFirst,
      mergedEventId: modSecond,
      x: -346912,
      cause: 'attack',
      killer: 'BOSS_SheepBall',
      killerKind: 'character',
      killerLevel: 12
    });
    expect(player.deaths).toBe(1);
    const [quiet] = await getDb().select().from(events).where(eq(events.id, modSecond));
    expect(quiet!.quiet).toBe(true);
    const item = await feedItem(snapshotFirst);
    expect(item.details).toMatchObject({
      cause: 'attack',
      killer: 'Lamball',
      killer_kind: 'pal',
      killer_level: 12
    });

    const modFirst = await send(
      'player.died',
      { ...moss, x: -300000, y: 250000, source: 'mod', cause: 'drown' },
      second(t0, 600)
    );
    const snapshotSecond = await send(
      'player.died',
      { ...moss, x: -300100, y: 250100, z: 1200, source: 'snapshot' },
      second(t0, 612)
    );
    rows = await knockoutsOf(player.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      eventId: modFirst,
      mergedEventId: snapshotSecond,
      x: -300100,
      y: 250100,
      z: 1200,
      cause: 'drown',
      killer: null
    });

    await send(
      'player.died',
      { ...moss, x: -300200, y: 250200, source: 'snapshot' },
      second(t0, 640)
    );
    rows = await knockoutsOf(player.id);
    expect(rows).toHaveLength(3);
    expect((await mossRow()).deaths).toBe(3);
    const detail = await getPlayer(getDb(), player.id, defaultSettings.features);
    expect(
      detail.recent_deaths.map((death) => [death.cause, death.killer, death.killer_kind])
    ).toEqual([
      [null, null, null],
      ['drown', null, null],
      ['attack', 'Lamball', 'pal']
    ]);
  });

  it('records catches, hatches, boss clears, unlocks and builds', async () => {
    const at = second(t0, 900);
    const caught = await send(
      'pal.captured',
      { ...moss, species: 'BOSS_SheepBall', level: 12 },
      at
    );
    const hatched = await send(
      'pal.hatched',
      { ...moss, species: 'ChickenPal', level: 1 },
      second(at, 1)
    );
    const tower = await send(
      'boss.defeated',
      { ...moss, kind: 'tower', boss: 'GrassBoss', difficulty: 'hard' },
      second(at, 2)
    );
    const raid = await send(
      'boss.defeated',
      { ...moss, kind: 'raid', boss: 'PalSummon_NightLady', species: 'RAID_NightLady' },
      second(at, 3)
    );
    const unlocked = await send(
      'technology.unlocked',
      { ...moss, technology: 'RepairBench' },
      second(at, 4)
    );
    const built = await send('structure.built', { ...moss, structure: 'Workbench' }, second(at, 5));

    const player = await mossRow();
    const detail = await getPlayer(getDb(), player.id, defaultSettings.features);
    expect(detail.feats).toEqual({
      captures: 1,
      hatches: 1,
      bosses: 2,
      technologies: 1,
      builds: 1
    });

    expect((await feedItem(caught)).details).toEqual({
      species: 'SheepBall',
      species_name: 'Lamball',
      level: 12
    });
    expect((await feedItem(hatched)).details).toMatchObject({ species_name: 'Chikipi', level: 1 });
    expect((await feedItem(tower)).details).toEqual({
      boss: 'GrassBoss',
      boss_kind: 'tower',
      boss_name: 'Zoe & Grizzbolt',
      difficulty: 'hard'
    });
    expect((await feedItem(raid)).details).toMatchObject({
      boss_kind: 'raid',
      boss_name: 'Bellanoir'
    });
    expect((await feedItem(unlocked)).details).toEqual({
      technology: 'RepairBench',
      technology_name: 'Repair Bench'
    });

    const page = { limit: 50, after: null };
    const feed = await listActivity(getDb(), defaultSettings.features, {
      types: null,
      playerId: player.id,
      page
    });
    const ids = feed.rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([caught, hatched, tower, raid, unlocked]));
    expect(ids).not.toContain(built);

    const noPals = { ...defaultSettings.features, pals: false };
    const hidden = await listActivity(getDb(), noPals, { types: null, playerId: player.id, page });
    expect(hidden.rows.map((row) => row.id)).not.toContain(caught);
    expect(hidden.rows.map((row) => row.id)).toContain(tower);
  });

  it('rebuilds the same knockouts and feats from the event log', async () => {
    const player = await mossRow();
    const before = {
      knockouts: await knockoutsOf(player.id),
      feats: await getDb().select().from(feats).orderBy(asc(feats.at)),
      deaths: player.deaths
    };
    await rebuildProjections(getDb());
    const after = await mossRow();
    const strip = (rows: { id: number }[]) =>
      rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id')));
    expect(strip(await knockoutsOf(after.id))).toEqual(strip(before.knockouts));
    expect(strip(await getDb().select().from(feats).orderBy(asc(feats.at)))).toEqual(
      strip(before.feats)
    );
    expect(after.deaths).toBe(before.deaths);
  });
});
