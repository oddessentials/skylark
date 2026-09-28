import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  deaths,
  feats,
  levelUps,
  players,
  positions,
  sessions,
  type PlayerRow,
  type SessionRow
} from '../db/schema';
import { notFound, type Page } from '../http/respond';
import type { Features } from '../settings';
import {
  displayName,
  guildNames,
  guildRef,
  platformName,
  readServerState,
  secondsBetween,
  type Schemas
} from './common';
import { killerOf } from './names';
import { partiesOf } from './status';
import { playerSaveOf, progressOf } from './saves';

export type PlayerSummary = Schemas['PlayerSummary'];
export type Player = Schemas['Player'];
export type Session = Schemas['Session'];
export type Trail = Schemas['Trail'];

export const playerSorts = ['last_seen', 'playtime', 'level', 'name'] as const;
export type PlayerSort = (typeof playerSorts)[number];

export const trailLimit = 2000;

async function featsOf(db: Database, playerId: number): Promise<Schemas['PlayerFeats'] | null> {
  const rows = await db
    .select({ kind: feats.kind, count: sql<number>`count(*)::int` })
    .from(feats)
    .where(eq(feats.playerId, playerId))
    .groupBy(feats.kind);
  if (rows.length === 0) return null;
  const count = (kind: string) => rows.find((row) => row.kind === kind)?.count ?? 0;
  return {
    captures: count('capture'),
    hatches: count('hatch'),
    bosses: count('boss'),
    technologies: count('technology'),
    builds: count('build')
  };
}

const livePlaytime = sql<number>`(${players.playtimeS} + coalesce(extract(epoch from (now() - ${sessions.joinedAt})), 0))`;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function summaryOf(
  row: PlayerRow,
  joinedAt: Date | null,
  names: Map<string, string>,
  now: Date
): PlayerSummary {
  return {
    id: row.id,
    name: displayName(row),
    level: row.level,
    platform: platformName(row.platform),
    guild: guildRef(row.guildId, names),
    online: row.online,
    first_seen: row.firstSeen.toISOString(),
    last_seen: (row.online ? now : row.lastSeen).toISOString(),
    playtime_s: Math.round(row.playtimeS + (joinedAt ? secondsBetween(joinedAt, now) : 0)),
    sessions: row.sessions,
    deaths: row.deaths
  };
}

export async function listPlayers(
  db: Database,
  sort: PlayerSort,
  search: string | null,
  page: Page,
  now = new Date()
): Promise<PlayerSummary[]> {
  const conditions: SQL[] = [eq(players.hidden, false)];
  if (search) {
    conditions.push(
      ilike(sql`coalesce(${players.nameOverride}, ${players.name})`, `%${escapeLike(search)}%`)
    );
  }
  const order =
    sort === 'playtime'
      ? [desc(livePlaytime), asc(players.id)]
      : sort === 'level'
        ? [desc(players.level), desc(players.lastSeen), asc(players.id)]
        : sort === 'name'
          ? [asc(sql`lower(coalesce(${players.nameOverride}, ${players.name}))`), asc(players.id)]
          : [desc(players.online), desc(players.lastSeen), asc(players.id)];
  const rows = await db
    .select({ player: players, joinedAt: sessions.joinedAt })
    .from(players)
    .leftJoin(sessions, eq(sessions.id, players.currentSessionId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(page.limit + 1)
    .offset(page.offset);
  const names = await guildNames(
    db,
    rows.map((row) => row.player.guildId)
  );
  return rows.map((row) => summaryOf(row.player, row.joinedAt, names, now));
}

export async function visiblePlayer(db: Database, id: number): Promise<PlayerRow> {
  const rows = await db.select().from(players).where(eq(players.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.hidden) throw notFound(`player ${id} does not exist`);
  return row;
}

export function sessionOf(row: SessionRow, features: Features): Session {
  return {
    id: row.id,
    joined_at: row.joinedAt.toISOString(),
    left_at: row.leftAt ? row.leftAt.toISOString() : null,
    duration_s: row.durationS === null ? null : Math.round(row.durationS),
    end_reason: row.endReason ?? null,
    level_start: row.levelStart,
    level_end: row.levelEnd,
    distance_m: features.positions ? Math.round(row.distanceM) : null,
    deaths: row.deaths
  };
}

export async function getPlayer(
  db: Database,
  id: number,
  features: Features,
  now = new Date()
): Promise<Player> {
  const row = await visiblePlayer(db, id);
  const [current, levels, recent, died, state, names, save, done] = await Promise.all([
    row.currentSessionId === null
      ? Promise.resolve([] as SessionRow[])
      : db.select().from(sessions).where(eq(sessions.id, row.currentSessionId)).limit(1),
    db
      .select({ at: levelUps.at, level: levelUps.toLevel })
      .from(levelUps)
      .where(eq(levelUps.playerId, id))
      .orderBy(asc(levelUps.at), asc(levelUps.id)),
    db
      .select()
      .from(sessions)
      .where(eq(sessions.playerId, id))
      .orderBy(desc(sessions.joinedAt), desc(sessions.id))
      .limit(5),
    db
      .select()
      .from(deaths)
      .where(eq(deaths.playerId, id))
      .orderBy(desc(deaths.at), desc(deaths.id))
      .limit(5),
    readServerState(db),
    guildNames(db, [row.guildId]),
    playerSaveOf(db, row.playerUid),
    featsOf(db, id)
  ]);
  const open = current[0] ?? null;
  const parties = features.pals
    ? await partiesOf(db, [id], state?.snapshotAt ?? null)
    : new Map<number, Schemas['PartyPal'][]>();
  const summary = summaryOf(row, open?.joinedAt ?? null, names, now);
  return {
    ...summary,
    current_session: open ? { id: open.id, joined_at: open.joinedAt.toISOString() } : null,
    distance_m: features.positions ? Math.round(row.distanceM) : null,
    chat_messages: features.chat ? row.chatMessages : null,
    position:
      features.positions && row.lastX !== null && row.lastY !== null && row.positionAt
        ? { x: row.lastX, y: row.lastY, at: row.positionAt.toISOString() }
        : null,
    party: parties.get(id) ?? [],
    level_history: levels.map((level) => ({ at: level.at.toISOString(), level: level.level })),
    recent_sessions: recent.map((session) => sessionOf(session, features)),
    recent_deaths: died.map((death) => ({
      at: death.at.toISOString(),
      x: features.positions ? death.x : null,
      y: features.positions ? death.y : null,
      cause: death.cause,
      ...killerOf(death.killer, death.killerKind),
      killer_level: death.killerLevel
    })),
    progress: progressOf(save),
    feats: done
  };
}

export async function listSessions(
  db: Database,
  playerId: number,
  page: Page,
  features: Features
): Promise<Session[]> {
  await visiblePlayer(db, playerId);
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.playerId, playerId))
    .orderBy(desc(sessions.joinedAt), desc(sessions.id))
    .limit(page.limit + 1)
    .offset(page.offset);
  return rows.map((row) => sessionOf(row, features));
}

export function thin<T>(points: T[], limit: number): T[] {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  const kept: T[] = [];
  for (let index = 0; index < limit; index += 1) kept.push(points[Math.round(index * step)]!);
  return kept;
}

export async function getTrail(
  db: Database,
  playerId: number,
  sessionId: number | null,
  now = new Date()
): Promise<Trail> {
  const player = await visiblePlayer(db, playerId);
  const chosen = sessionId ?? player.currentSessionId;
  const rows = chosen
    ? await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, chosen), eq(sessions.playerId, playerId)))
        .limit(1)
    : await db
        .select()
        .from(sessions)
        .where(eq(sessions.playerId, playerId))
        .orderBy(desc(sessions.joinedAt))
        .limit(1);
  const session = rows[0];
  if (!session) {
    if (sessionId !== null) throw notFound(`session ${sessionId} does not exist`);
    return { session_id: null, points: [] };
  }
  const points = await db
    .select({ ts: positions.ts, x: positions.x, y: positions.y })
    .from(positions)
    .where(
      and(
        eq(positions.playerId, playerId),
        gte(positions.ts, session.joinedAt),
        lte(positions.ts, session.leftAt ?? now)
      )
    )
    .orderBy(asc(positions.ts));
  return {
    session_id: session.id,
    points: thin(points, trailLimit).map((point) => ({
      at: point.ts.toISOString(),
      x: point.x,
      y: point.y
    }))
  };
}
