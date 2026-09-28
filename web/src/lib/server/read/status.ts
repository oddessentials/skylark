import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { collectorRuns, pals, players, sessions, type CollectorRunRow } from '../db/schema';
import type { Features } from '../settings';
import {
  deathAction,
  displayName,
  guildNames,
  guildRef,
  platformName,
  readServerState,
  speciesOf,
  type Schemas
} from './common';

export type Status = Schemas['Status'];
export type OnlineList = Schemas['OnlineList'];
export type OnlinePlayer = Schemas['OnlinePlayer'];
export type PartyPal = Schemas['PartyPal'];
export type CollectorState = Schemas['StatusCollector']['state'];

export const collectorLostAfterSeconds = 180;

export async function latestRun(db: Database): Promise<CollectorRunRow | null> {
  const rows = await db
    .select()
    .from(collectorRuns)
    .orderBy(desc(collectorRuns.lastSeenAt))
    .limit(1);
  return rows[0] ?? null;
}

export function collectorStateOf(run: CollectorRunRow | null, now: Date): CollectorState {
  if (!run) return 'none';
  if (run.stoppedAt) return 'stopped';
  if (run.lostAt) return 'lost';
  if (now.getTime() - run.lastSeenAt.getTime() > collectorLostAfterSeconds * 1000) return 'lost';
  return 'active';
}

function layersOf(run: CollectorRunRow | null): Schemas['CollectorLayersSummary'] | null {
  const layers = run?.layers;
  if (!layers) return null;
  const flag = (name: string) => layers[name] === true;
  return {
    rest: flag('rest'),
    gamedata: flag('gamedata'),
    logs: flag('logs'),
    saves: flag('saves'),
    mod: flag('mod')
  };
}

export async function onlineCount(db: Database): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(players)
    .where(and(eq(players.online, true), eq(players.hidden, false)));
  return rows[0]?.count ?? 0;
}

export async function computeStatus(db: Database, now = new Date()): Promise<Status> {
  const [state, run, online] = await Promise.all([
    readServerState(db),
    latestRun(db),
    onlineCount(db)
  ]);
  const collector = collectorStateOf(run, now);
  let current: Status['state'] = 'unknown';
  let since: Date | null = null;
  if (collector === 'lost') {
    since = run?.lostAt ?? run?.lastSeenAt ?? null;
  } else if (collector === 'stopped') {
    since = run?.stoppedAt ?? null;
  } else if (collector === 'active' && state) {
    if (state.online) {
      current = 'online';
      since = state.onlineSince;
    } else if (state.offlineSince) {
      current = 'offline';
      since = state.offlineSince;
    }
  }
  const live = current === 'online';
  return {
    state: current,
    since: since ? since.toISOString() : null,
    server: {
      name: state?.serverName ?? null,
      description: state?.serverDescription ?? null,
      version: state?.serverVersion ?? null
    },
    players: { online: current === 'online' ? online : 0, max: state?.maxPlayers ?? null },
    performance: {
      fps: live ? (state?.fps ?? null) : null,
      fps_avg: live ? (state?.fpsAvg ?? null) : null,
      frame_time_ms: live ? (state?.frameTimeMs ?? null) : null,
      uptime_s: live ? (state?.uptimeS ?? null) : null,
      measured_at: live && state?.metricsAt ? state.metricsAt.toISOString() : null
    },
    clock: {
      time: state?.inGameTime ?? null,
      day: state?.inGameDay ?? state?.days ?? null,
      observed_at: state?.inGameAt ? state.inGameAt.toISOString() : null,
      day_speed: state?.dayTimeSpeedRate ?? null,
      night_speed: state?.nightTimeSpeedRate ?? null
    },
    collector: {
      state: collector,
      version: run?.collectorVersion ?? null,
      last_seen_at: run ? run.lastSeenAt.toISOString() : null,
      layers: layersOf(run)
    },
    updated_at: now.toISOString()
  };
}

export async function partiesOf(
  db: Database,
  ownerIds: number[],
  snapshotAt: Date | null
): Promise<Map<number, PartyPal[]>> {
  const parties = new Map<number, PartyPal[]>();
  if (ownerIds.length === 0 || !snapshotAt) return parties;
  const rows = await db
    .select()
    .from(pals)
    .where(
      and(
        eq(pals.kind, 'party'),
        inArray(pals.ownerPlayerId, ownerIds),
        eq(pals.seenAt, snapshotAt)
      )
    )
    .orderBy(desc(pals.level), asc(pals.instanceId));
  for (const row of rows) {
    const owner = row.ownerPlayerId!;
    const list = parties.get(owner) ?? [];
    list.push({ species: speciesOf(row.className), name: row.name, level: row.level });
    parties.set(owner, list);
  }
  return parties;
}

export async function computeOnline(
  db: Database,
  features: Features,
  now = new Date()
): Promise<OnlineList> {
  const rows = await db
    .select({ player: players, joinedAt: sessions.joinedAt })
    .from(players)
    .leftJoin(sessions, eq(sessions.id, players.currentSessionId))
    .where(and(eq(players.online, true), eq(players.hidden, false)))
    .orderBy(asc(sessions.joinedAt), asc(players.id));
  const state = await readServerState(db);
  const names = await guildNames(
    db,
    rows.map((row) => row.player.guildId)
  );
  const parties = features.pals
    ? await partiesOf(
        db,
        rows.map((row) => row.player.id),
        state?.snapshotAt ?? null
      )
    : new Map<number, PartyPal[]>();
  const list: OnlinePlayer[] = rows.map(({ player, joinedAt }) => ({
    id: player.id,
    name: displayName(player),
    level: player.level,
    platform: platformName(player.platform),
    guild: guildRef(player.guildId, names),
    joined_at: (joinedAt ?? player.lastSeen).toISOString(),
    down: player.action === deathAction,
    hp: player.hp,
    max_hp: player.maxHp,
    position:
      features.positions && player.lastX !== null && player.lastY !== null
        ? { x: player.lastX, y: player.lastY }
        : null,
    party: parties.get(player.id) ?? []
  }));
  return { players: list, updated_at: now.toISOString() };
}
