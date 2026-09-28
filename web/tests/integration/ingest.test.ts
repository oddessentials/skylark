import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IngestBatch, IngestResult } from '../../src/lib/api/types';
import { getDb } from '../../src/lib/server/db/client';
import {
  actions,
  bases,
  chatMessages,
  collectorRuns,
  deaths,
  events,
  feats,
  guilds,
  levelUps,
  pals,
  players,
  positions,
  sessions
} from '../../src/lib/server/db/schema';
import { runWatchdog } from '../../src/lib/server/jobs/watchdog';
import { rebuildProjections } from '../../src/lib/server/jobs/rebuild';
import { computeOnline, computeStatus } from '../../src/lib/server/read/status';
import { getGuild, getMap } from '../../src/lib/server/read/community';
import { getGuildPalpedia, getPlayerPalpedia } from '../../src/lib/server/read/palpedia';
import { getGuildPals } from '../../src/lib/server/read/pals';
import { getPlayer } from '../../src/lib/server/read/players';
import { defaultSettings } from '../../src/lib/server/settings';
import { POST as ingest } from '../../src/routes/api/ingest/+server';
import { resetDatabase, routeEvent, seededHistory, signedRequest, useTestDatabase } from './setup';
import { toBatches, type SimulatedHistory } from '../../scripts/simulator/generator';

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

async function post(batch: IngestBatch | string, overrides: Record<string, string> = {}) {
  return ingest(routeEvent(signedRequest(batch, overrides)));
}

async function send(batch: IngestBatch): Promise<IngestResult> {
  const response = await post(batch);
  expect(response.status).toBe(200);
  return (await response.json()) as IngestResult;
}

function envelope(
  history: SimulatedHistory,
  type: string,
  data: Record<string, unknown>,
  at: Date,
  seq = 900_000
) {
  const runId = history.runs[history.runs.length - 1]!.runId;
  return {
    collector: { name: 'skylark-collector', version: '0.1.0', run_id: runId },
    server: history.server,
    events: [{ id: randomUUID(), seq, run_id: runId, ts: at.toISOString(), type, data }]
  } as IngestBatch;
}

let history: SimulatedHistory;
let batches: IngestBatch[];

beforeAll(async () => {
  useTestDatabase();
  await resetDatabase();
  history = seededHistory(2);
  batches = toBatches(history);
});

describe('POST /api/ingest', () => {
  it('rejects bad signatures and stale timestamps with 401', async () => {
    const batch = batches[0]!;
    expect((await post(batch, { 'x-skylark-signature': 'sha256=' + '0'.repeat(64) })).status).toBe(
      401
    );
    expect(
      (await post(batch, { 'x-skylark-timestamp': String(Math.floor(Date.now() / 1000) - 3600) }))
        .status
    ).toBe(401);
    const unsigned = new Request('http://test/api/ingest', {
      method: 'POST',
      body: JSON.stringify(batch)
    });
    expect((await ingest(routeEvent(unsigned))).status).toBe(401);
  });

  it('rejects malformed envelopes with 422 and oversized bodies with 413', async () => {
    expect((await post('{"collector":{}}')).status).toBe(422);
    expect((await post('not json')).status).toBe(422);
    const first = batches[0]!;
    const repeated = { ...first, events: [first.events[0]!, first.events[0]!] };
    expect((await post(repeated)).status).toBe(422);
    const tooMany = {
      ...first,
      events: Array.from({ length: 501 }, (_, index) => ({
        ...first.events[0]!,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        seq: index
      }))
    };
    expect((await post(tooMany)).status).toBe(422);
    expect((await post(JSON.stringify({ ...first, padding: 'x'.repeat(600 * 1024) }))).status).toBe(
      413
    );
  });

  it('stores every event once, counts replays as duplicates and reports the last seq', async () => {
    const first = batches[0]!;
    const result = await send({ ...first, events: [...first.events].reverse() });
    expect(result.accepted).toBe(first.events.length);
    expect(result.duplicates).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.last_seq).toBe(Math.max(...first.events.map((event) => event.seq)));
    expect(result.actions).toEqual([]);
    const replay = await send(first);
    expect(replay.accepted).toBe(0);
    expect(replay.duplicates).toBe(first.events.length);
  });

  it('projects the whole simulated history', async () => {
    for (const batch of batches.slice(1)) await send(batch);
    const db = getDb();
    const count = async (table: PgTable) =>
      (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;
    const typed = (type: string) => history.events.filter((event) => event.type === type);
    const seen = new Set(
      history.events.map((event) => (event.data as { user_id?: string }).user_id).filter(Boolean)
    );
    expect(await count(players)).toBe(seen.size);
    expect(await count(levelUps)).toBe(typed('player.level_up').length);
    const knockouts = typed('player.died');
    const fromSnapshots = knockouts.filter(
      (event) => (event.data as { source: string }).source === 'snapshot'
    );
    expect(knockouts.length).toBeGreaterThan(fromSnapshots.length);
    expect(await count(deaths)).toBe(fromSnapshots.length);
    const featTypes = [
      'pal.captured',
      'pal.hatched',
      'boss.defeated',
      'technology.unlocked',
      'structure.built'
    ];
    for (const type of featTypes) expect(typed(type).length).toBeGreaterThan(0);
    expect(await count(feats)).toBe(featTypes.reduce((sum, type) => sum + typed(type).length, 0));
    expect(await count(chatMessages)).toBe(typed('chat.message').length);
    expect(await count(guilds)).toBe(history.guilds.length);
    expect(await count(positions)).toBeGreaterThan(100);
    expect(await count(pals)).toBeGreaterThan(10);
    const online = await computeOnline(db, defaultSettings.features);
    expect(online.players.map((player) => player.name).sort()).toEqual(
      history.onlineAtEnd.map((player) => player.name).sort()
    );
    expect(online.players.every((player) => player.position !== null)).toBe(true);
    const status = await computeStatus(db);
    expect(status.state).toBe('online');
    expect(status.players.online).toBe(history.onlineAtEnd.length);
    expect(status.clock.time).toMatch(/^\d{2}:\d{2}$/);
    expect(status.collector.state).toBe('active');
    const closed = await db
      .select()
      .from(sessions)
      .where(sql`${sessions.leftAt} is not null`);
    expect(closed.length).toBeGreaterThan(5);
    expect(closed.every((session) => (session.durationS ?? -1) >= 0)).toBe(true);
    const reasons = new Set(closed.map((session) => session.endReason));
    expect(reasons.has('left')).toBe(true);
    const distance = await db
      .select({ total: sql<number>`sum(${players.distanceM})` })
      .from(players);
    expect(Number(distance[0]!.total)).toBeGreaterThan(1000);
  });

  it('writes site events for guild changes and bases, with no baseline flood', async () => {
    const db = getDb();
    const siteRows = await db.select().from(events).where(eq(events.source, 'site'));
    const types = siteRows.map((row) => row.type);
    expect(types).toContain('guild.renamed');
    const established = siteRows.filter((row) => row.type === 'base.established');
    const baseRows = await db.select().from(bases);
    expect(established.length).toBeLessThan(baseRows.length);
    expect(
      established.every((row) => typeof (row.data as { guild_id?: unknown }).guild_id === 'string')
    ).toBe(true);
    const runs = await db.select().from(collectorRuns).orderBy(asc(collectorRuns.startedAt));
    expect(runs.length).toBe(history.runs.length);
  });

  it('stores unknown event types and flags invalid data without failing the batch', async () => {
    const at = new Date();
    const unknown = await send(envelope(history, 'world.weather_changed', { rain: true }, at));
    expect(unknown.accepted).toBe(1);
    expect(unknown.invalid).toBe(0);
    const invalid = await send(
      envelope(history, 'player.joined', { name: 'Nobody', source: 'log' }, at, 900_001)
    );
    expect(invalid.accepted).toBe(1);
    expect(invalid.invalid).toBe(1);
    const flagged = await getDb()
      .select()
      .from(events)
      .where(eq(events.type, 'player.joined'))
      .then((rows) => rows.filter((row) => row.invalid !== null));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.invalid).toMatch(/user_id/);
  });

  it('keeps what the world save says: progress, guild roles and base workers', async () => {
    const db = getDb();
    const features = defaultSettings.features;
    const [player] = await db
      .select()
      .from(players)
      .where(sql`${players.playerUid} is not null`)
      .orderBy(asc(players.id))
      .limit(1);
    const [base] = await db
      .select()
      .from(bases)
      .where(and(isNull(bases.goneAt), sql`${bases.guildId} is not null`))
      .orderBy(asc(bases.id))
      .limit(1);
    const guildId = base!.guildId!;
    const savedAt = new Date();
    const at = savedAt.toISOString();
    const saved = (type: string, data: Record<string, unknown>, seq: number) =>
      send(envelope(history, type, { saved_at: at, ...data }, savedAt, seq));
    await saved(
      'save.player',
      {
        player_id: player!.playerUid,
        name: player!.name,
        level: 31,
        guild_id: guildId,
        last_online_at: new Date(savedAt.getTime() - 3_600_000).toISOString(),
        progress: {
          palpedia: 62,
          palpedia_entries: ['PinkCat', 'Sheepball', 'Human'],
          species_captured: 61,
          captures: 180,
          species_captures: { Sheepball: 12, PinkCat: 3, Human: 2 },
          tower_bosses: ['GrassBoss', 'WorldTreeMiddleBoss1', 'FutureBoss'],
          field_bosses: 18,
          dungeon_clears: 5,
          fixed_dungeon_clears: 11,
          technologies: 112,
          fast_travel_points: 32
        }
      },
      910_001
    );
    await saved(
      'save.guild',
      {
        guild_id: guildId,
        name: 'Saved name',
        base_camp_level: 4,
        members: [
          { player_id: 'ABCDEF01000000000000000000000000', name: 'Offline Friend', role: 'member' },
          { player_id: player!.playerUid, name: player!.name, role: 'guild_master' }
        ]
      },
      910_002
    );
    await saved(
      'save.base',
      {
        base_id: 'BA5E0000000000000000000000000003',
        guild_id: guildId,
        name: null,
        x: base!.x + 0.1,
        y: base!.y - 0.1,
        z: base!.z,
        workers: [
          { instance_id: '21', character_id: 'BOSS_FoxMage', level: 28, name: 'Ember' },
          { instance_id: '22', character_id: 'Sheepball', level: 9, name: null }
        ]
      },
      910_003
    );
    await saved(
      'save.pals',
      {
        player_id: player!.playerUid,
        base_id: null,
        pals: [
          {
            instance_id: '24000000000000000000000000000000',
            species: 'Kitsunebi',
            alpha: true,
            where: 'box',
            gender: 'female',
            level: 12,
            rank: 2,
            talents: { hp: 90, shot: 95, defense: 100 },
            passives: ['Rare', 'Noukin', 'NotARow'],
            lucky: true,
            name: 'Blaze'
          },
          {
            instance_id: '23000000000000000000000000000000',
            species: 'Pinkcat',
            alpha: false,
            where: 'party',
            gender: 'male',
            level: 4,
            talents: { hp: 30, shot: 40, defense: 50 },
            passives: []
          }
        ],
        eggs: [
          {
            egg_id: 'E6600000000000000000000000000001',
            item_id: 'PalEgg_Fire_01',
            species: 'Kitsunebi',
            alpha: false
          }
        ],
        incubators: []
      },
      910_004
    );
    await saved(
      'save.pals',
      {
        player_id: null,
        base_id: 'BA5E0000000000000000000000000003',
        pals: [],
        eggs: [
          {
            egg_id: 'E6600000000000000000000000000003',
            item_id: 'PalEgg_Dark_03',
            species: 'NightFox',
            alpha: false
          }
        ],
        incubators: [
          {
            object_id: '0B1E000000000000000000000000000A',
            kind: 'HatchingPalEgg',
            eggs: [
              {
                egg_id: 'E6600000000000000000000000000002',
                item_id: 'PalEgg_Leaf_05',
                species: 'GrassMammoth',
                alpha: true
              }
            ],
            hatched: {
              instance_id: '0B1E000000000000000000000000000A',
              species: 'GrassMammoth',
              alpha: true,
              where: 'incubator',
              gender: 'male',
              level: 1,
              talents: { hp: 50, shot: 60, defense: 70 },
              passives: ['Rare'],
              lucky: true
            }
          }
        ]
      },
      910_005
    );
    await saved(
      'save.read',
      {
        player_ids: [player!.playerUid],
        guild_ids: [guildId],
        base_ids: ['BA5E0000000000000000000000000003']
      },
      910_006
    );
    const detail = await getPlayer(db, player!.id, features);
    expect(detail.progress).toMatchObject({
      saved_at: at,
      palpedia: 62,
      palpedia_total: 288,
      captures: 180,
      field_bosses: 18,
      dungeon_clears: 16,
      technologies: 112,
      tower_bosses_total: 8
    });
    expect(detail.progress!.tower_bosses).toEqual([
      { id: 'GrassBoss', name: 'Rayne Syndicate Tower' },
      { id: 'FutureBoss', name: 'FutureBoss' }
    ]);
    expect(detail.progress!.species_captured).toBe(2);
    const palpedia = await getPlayerPalpedia(db, player!.id);
    expect(palpedia.player).toEqual({ id: player!.id, name: player!.nameOverride ?? player!.name });
    expect(palpedia.saved_at).toBe(at);
    expect(palpedia.unlocked).toBe(2);
    expect(palpedia.total).toBe(288);
    expect(palpedia.entries).toHaveLength(288);
    expect(palpedia.entries.filter((entry) => entry.caught).map((entry) => entry.species)).toEqual([
      'SheepBall',
      'PinkCat'
    ]);
    const lamball = palpedia.entries.find((entry) => entry.species === 'SheepBall')!;
    expect(lamball).toMatchObject({ caught: true, captures: 12, night_only: false });
    expect(lamball.ways).toContain('wild');
    expect(lamball.levels![0]).toBeLessThanOrEqual(lamball.levels![1]!);
    const astralym = palpedia.entries.find((entry) => entry.species === 'WorldTreeDragon')!;
    expect(astralym).toMatchObject({ caught: false, captures: 0, ways: [], levels: null });
    const guildPalpedia = await getGuildPalpedia(db, guildId);
    expect(guildPalpedia.guild.id).toBe(guildId);
    expect(guildPalpedia.saved_at).toBe(at);
    expect(guildPalpedia.unlocked).toBe(2);
    expect(guildPalpedia.members).toEqual([
      {
        player: { id: player!.id, name: player!.nameOverride ?? player!.name },
        name: player!.nameOverride ?? player!.name,
        unlocked: 2
      },
      { player: null, name: 'Offline Friend', unlocked: 0 }
    ]);
    const guildLamball = guildPalpedia.entries.find((entry) => entry.species === 'SheepBall')!;
    expect(guildLamball).toMatchObject({ caught: true, captures: 12, holders: [0] });
    expect(guildPalpedia.entries.filter((entry) => entry.caught)).toHaveLength(2);
    const kept = await getGuildPals(db, guildId);
    expect(kept.guild.id).toBe(guildId);
    expect(kept.saved_at).toBe(at);
    expect(kept.members.map((member) => [member.name, member.pals])).toEqual([
      [player!.nameOverride ?? player!.name, 2],
      ['Offline Friend', 0]
    ]);
    expect(
      kept.pals.map((pal) => [pal.species, pal.where, pal.member, pal.rank, pal.name])
    ).toEqual([
      ['PinkCat', 'party', 0, 1, null],
      ['Kitsunebi', 'box', 0, 2, 'Blaze']
    ]);
    expect(kept.pals[1]).toMatchObject({
      alpha: true,
      gender: 'female',
      level: 12,
      talents: { hp: 90, shot: 95, defense: 100 },
      lucky: true
    });
    expect(kept.pals[1]!.passives).toEqual([
      { id: 'Rare', name: 'Lucky', rank: 4 },
      { id: 'Noukin', name: 'Musclehead', rank: 2 },
      { id: 'NotARow', name: 'NotARow', rank: 0 }
    ]);
    expect(kept.eggs.map((egg) => [egg.where, egg.kind_name, egg.species, egg.member])).toEqual([
      ['inventory', 'Scorching Egg', 'Kitsunebi', 0],
      ['base', 'Large Dark Egg', 'NightFox', null],
      ['incubator', 'Huge Verdant Egg', 'GrassMammoth', null]
    ]);
    expect(kept.eggs[1]!.base).toMatchObject({ id: base!.id, name: base!.name });
    expect(kept.eggs[2]!.hatched).toMatchObject({
      species: 'GrassMammoth',
      alpha: true,
      gender: 'male',
      rank: 1,
      lucky: true,
      passives: [{ id: 'Rare', name: 'Lucky', rank: 4 }]
    });
    const guild = await getGuild(db, guildId, features);
    expect(guild.base_camp_level).toBe(4);
    expect(guild.roster_saved_at).toBe(at);
    expect(guild.roster.map((entry) => [entry.name, entry.role, entry.player?.id ?? null])).toEqual(
      [
        [player!.nameOverride ?? player!.name, 'guild_master', player!.id],
        ['Offline Friend', 'member', null]
      ]
    );
    const member = guild.members.find((entry) => entry.player.id === player!.id);
    if (member) expect(member.role).toBe('guild_master');
    const savedBase = guild.bases.find((entry) => entry.id === base!.id)!;
    expect(savedBase.workers).toBe(2);
    expect(savedBase.workers_seen_at).toBe(at);
    expect(savedBase.worker_pals).toEqual([
      { species: 'FoxMage', alpha: true, name: 'Ember', level: 28 },
      { species: 'SheepBall', alpha: false, name: null, level: 9 }
    ]);
    const map = await getMap(db, features);
    const mapBase = map.bases.find((entry) => entry.id === base!.id)!;
    expect(mapBase.workers).toBe(2);
    expect('worker_pals' in mapBase).toBe(false);
    const quiet = await db
      .select()
      .from(events)
      .where(sql`${events.type} like 'save.%'`);
    expect(quiet.length).toBeGreaterThanOrEqual(4);
    expect(quiet.every((row) => row.quiet)).toBe(true);
    const later = new Date(savedAt.getTime() + 300_000);
    await send(
      envelope(
        history,
        'save.read',
        {
          saved_at: later.toISOString(),
          player_ids: [player!.playerUid],
          guild_ids: [guildId],
          base_ids: []
        },
        later,
        910_005
      )
    );
    const after = await getGuild(db, guildId, features);
    expect(after.bases.find((entry) => entry.id === base!.id)!.worker_pals).toEqual([]);
    expect(after.roster).toHaveLength(2);
  });

  it('delivers queued actions until the collector reports them', async () => {
    const db = getDb();
    const [queued] = await db
      .insert(actions)
      .values({ kind: 'announce', message: 'Server restart in 10 minutes' })
      .returning();
    const at = new Date();
    const first = await send(envelope(history, 'world.weather_changed', {}, at, 900_010));
    expect(first.actions.map((action) => action.id)).toEqual([queued!.id]);
    expect(first.actions[0]).toMatchObject({
      kind: 'announce',
      message: 'Server restart in 10 minutes'
    });
    const again = await send(envelope(history, 'world.weather_changed', {}, at, 900_011));
    expect(again.actions.map((action) => action.id)).toEqual([queued!.id]);
    const done = await send(
      envelope(
        history,
        'action.completed',
        { action_id: queued!.id, kind: 'announce' },
        at,
        900_012
      )
    );
    expect(done.actions).toEqual([]);
    const [row] = await db.select().from(actions).where(eq(actions.id, queued!.id));
    expect(row!.completedAt).not.toBeNull();
  });

  it('closes the sessions of a lost collector and reopens them from the next snapshot', async () => {
    const db = getDb();
    const lastSnapshot = [...history.events]
      .reverse()
      .find((event) => event.type === 'world.snapshot')!;
    const runId = history.runs[history.runs.length - 1]!.runId;
    await db
      .update(collectorRuns)
      .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(collectorRuns.runId, runId));
    const result = await runWatchdog(db, new Date(), new Date(0));
    expect(result.lostRuns).toEqual([runId]);
    expect(result.siteEvents.map((event) => event.type)).toEqual(['collector.lost']);
    const open = await db.select().from(sessions).where(isNull(sessions.leftAt));
    expect(open).toHaveLength(0);
    expect((await computeStatus(db)).state).toBe('unknown');
    const later = new Date(Date.now() + 1000);
    const back = await send({
      ...envelope(
        history,
        'world.snapshot',
        lastSnapshot.data as Record<string, unknown>,
        later,
        900_020
      )
    });
    expect(back.accepted).toBe(1);
    const reopened = await db
      .select()
      .from(sessions)
      .where(and(isNull(sessions.leftAt), eq(sessions.source, 'site')));
    expect(reopened.length).toBe(history.onlineAtEnd.length);
    const quiet = await db
      .select()
      .from(events)
      .where(and(eq(events.source, 'site'), eq(events.type, 'player.joined')));
    expect(quiet.every((row) => row.quiet)).toBe(true);
  });
});

describe('rebuilding from the event log', () => {
  it('reproduces sessions, level-ups, deaths, chat and player totals', async () => {
    const db = getDb();
    const capture = async () => ({
      sessions: (
        await db
          .select({
            playerId: sessions.playerId,
            joinedAt: sessions.joinedAt,
            leftAt: sessions.leftAt,
            endReason: sessions.endReason,
            deaths: sessions.deaths
          })
          .from(sessions)
          .orderBy(asc(sessions.playerId), asc(sessions.joinedAt))
      ).map((row) => ({
        ...row,
        joinedAt: row.joinedAt.toISOString(),
        leftAt: row.leftAt?.toISOString() ?? null
      })),
      players: await db
        .select({
          id: players.id,
          sessions: players.sessions,
          deaths: players.deaths,
          chat: players.chatMessages,
          online: players.online,
          playtime: sql<number>`round(${players.playtimeS})::int`
        })
        .from(players)
        .orderBy(asc(players.id)),
      levelUps: (await db.select({ n: sql<number>`count(*)::int` }).from(levelUps))[0]!.n,
      deaths: (await db.select({ n: sql<number>`count(*)::int` }).from(deaths))[0]!.n,
      chat: (await db.select({ n: sql<number>`count(*)::int` }).from(chatMessages))[0]!.n
    });
    const before = await capture();
    const result = await rebuildProjections(db);
    expect(result.replayed).toBeGreaterThan(100);
    const after = await capture();
    expect(after).toEqual(before);
  });
});
