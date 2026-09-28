import { and, asc, desc, eq, gt, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  bases,
  chatMessages,
  deaths,
  guildMembers,
  guilds,
  levelUps,
  players,
  sessions,
  worldLive,
  collectorRuns,
  type BaseRow,
  events
} from '../db/schema';
import { baseNameOf, regionAt } from '$lib/world/regions';
import { notFound, type KeysetPage } from '../http/respond';
import type { Features } from '../settings';
import {
  chatChannel,
  deathAction,
  displayName,
  guildNames,
  guildRef,
  playerRef,
  readServerState,
  speciesOf,
  type Schemas
} from './common';

export type ChatItem = Schemas['ChatItem'];
export type Base = Schemas['Base'];
export type GuildSummary = Schemas['GuildSummary'];
export type Guild = Schemas['Guild'];
export type MapState = Schemas['MapState'];
export type Leaderboards = Schemas['Leaderboards'];
export type LeaderboardEntry = Schemas['LeaderboardEntry'];
export type World = Schemas['World'];

export const leaderboardSize = 10;
export const mapDeathsWindowMs = 24 * 60 * 60 * 1000;
export const wildFreshMs = 60_000;

export async function listChat(
  db: Database,
  features: Features,
  page: KeysetPage
): Promise<ChatItem[]> {
  const conditions: SQL[] = [or(isNull(chatMessages.playerId), eq(players.hidden, false))!];
  if (!features.guild_chat) conditions.push(sql`lower(${chatMessages.channel}) <> 'guild'`);
  const after = page.after;
  if (after) {
    conditions.push(
      or(
        lt(chatMessages.at, after.ts),
        and(eq(chatMessages.at, after.ts), lt(chatMessages.eventId, after.id))
      )!
    );
  }
  const rows = await db
    .select({ message: chatMessages, player: players })
    .from(chatMessages)
    .leftJoin(players, eq(players.id, chatMessages.playerId))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.at), desc(chatMessages.eventId))
    .limit(page.limit + 1);
  return rows.map(({ message, player }) => ({
    id: message.eventId,
    ts: message.at.toISOString(),
    player: player ? playerRef(player) : null,
    channel: chatChannel(message.channel),
    text: message.text
  }));
}

export function baseOf(row: BaseRow, names: Map<string, string>): Base {
  return {
    id: row.id,
    name: baseNameOf(row.name),
    region: regionAt(row.x, row.y),
    guild: guildRef(row.guildId, names),
    x: row.x,
    y: row.y,
    workers: row.workers,
    workers_seen_at: row.workersSeenAt ? row.workersSeenAt.toISOString() : null,
    first_seen: row.firstSeen.toISOString(),
    last_seen: row.lastSeen.toISOString(),
    gone_at: row.goneAt ? row.goneAt.toISOString() : null
  };
}

async function standingBases(db: Database, guildId: string | null = null): Promise<BaseRow[]> {
  const conditions: SQL[] = [isNull(bases.goneAt)];
  if (guildId !== null) conditions.push(eq(bases.guildId, guildId));
  return db
    .select()
    .from(bases)
    .where(and(...conditions))
    .orderBy(asc(bases.firstSeen), asc(bases.id));
}

export async function listGuilds(db: Database, features: Features): Promise<GuildSummary[]> {
  const memberRows = await db
    .select({
      id: guilds.id,
      members: sql<number>`count(${players.id})::int`,
      online: sql<number>`count(${players.id}) filter (where ${players.online})::int`,
      topLevel: sql<number | null>`max(${players.level})::int`
    })
    .from(guilds)
    .innerJoin(
      guildMembers,
      and(eq(guildMembers.guildId, guilds.id), eq(guildMembers.current, true))
    )
    .innerJoin(players, and(eq(players.id, guildMembers.playerId), eq(players.hidden, false)))
    .groupBy(guilds.id);
  const counts = new Map(memberRows.map((row) => [row.id, row]));
  const baseCounts = new Map<string, number>();
  if (features.bases) {
    for (const base of await standingBases(db)) {
      if (base.guildId) baseCounts.set(base.guildId, (baseCounts.get(base.guildId) ?? 0) + 1);
    }
  }
  const all = await db.select().from(guilds);
  return all
    .filter((guild) => counts.has(guild.id) || baseCounts.has(guild.id))
    .map((guild) => {
      const members = counts.get(guild.id);
      return {
        id: guild.id,
        name: guild.name,
        members: members?.members ?? 0,
        online: members?.online ?? 0,
        top_level: members?.topLevel ?? null,
        bases: features.bases ? (baseCounts.get(guild.id) ?? 0) : null,
        first_seen: guild.firstSeen.toISOString(),
        last_seen: guild.lastSeen.toISOString()
      };
    })
    .sort(
      (a, b) =>
        b.members - a.members ||
        (b.bases ?? 0) - (a.bases ?? 0) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
    );
}

export async function getGuild(
  db: Database,
  id: string,
  features: Features,
  now = new Date()
): Promise<Guild> {
  const found = await db.select().from(guilds).where(eq(guilds.id, id)).limit(1);
  const guild = found[0];
  if (!guild) throw notFound(`guild ${id} does not exist`);
  const members = await db
    .select({ member: guildMembers, player: players })
    .from(guildMembers)
    .innerJoin(players, eq(players.id, guildMembers.playerId))
    .where(
      and(eq(guildMembers.guildId, id), eq(guildMembers.current, true), eq(players.hidden, false))
    )
    .orderBy(desc(players.level), asc(guildMembers.firstSeen), asc(players.id));
  const guildBases = features.bases ? await standingBases(db, id) : [];
  const names = new Map([[guild.id, guild.name]]);
  return {
    id: guild.id,
    name: guild.name,
    members: members.map(({ member, player }) => ({
      player: playerRef(player),
      level: player.level,
      online: player.online,
      since: member.firstSeen.toISOString(),
      last_seen: (player.online ? now : player.lastSeen).toISOString()
    })),
    bases: guildBases.map((row) => baseOf(row, names)),
    first_seen: guild.firstSeen.toISOString(),
    last_seen: guild.lastSeen.toISOString()
  };
}

interface WildEntry {
  class?: unknown;
  name?: unknown;
  level?: unknown;
  x?: unknown;
  y?: unknown;
}

export async function getMap(
  db: Database,
  features: Features,
  now = new Date()
): Promise<MapState> {
  const state = await readServerState(db);
  const online = features.positions
    ? await db
        .select()
        .from(players)
        .where(and(eq(players.online, true), eq(players.hidden, false)))
        .orderBy(asc(players.id))
    : [];
  const standing = features.bases ? await standingBases(db) : [];
  const names = await guildNames(
    db,
    standing.map((row) => row.guildId)
  );
  let wild: Schemas['MapWild'][] = [];
  if (features.pals) {
    const live = await db.select().from(worldLive).where(eq(worldLive.id, 1)).limit(1);
    const row = live[0];
    if (
      row &&
      state?.snapshotAt &&
      Math.abs(row.snapshotAt.getTime() - state.snapshotAt.getTime()) <= wildFreshMs
    ) {
      wild = (row.wild as WildEntry[]).flatMap((entry) =>
        typeof entry.class === 'string' &&
        typeof entry.x === 'number' &&
        typeof entry.y === 'number'
          ? [
              {
                species: speciesOf(entry.class),
                name: typeof entry.name === 'string' ? entry.name : null,
                level: typeof entry.level === 'number' ? entry.level : 0,
                x: entry.x,
                y: entry.y
              }
            ]
          : []
      );
    }
  }
  const recentDeaths = features.positions
    ? await db
        .select({ death: deaths, player: players })
        .from(deaths)
        .innerJoin(players, eq(players.id, deaths.playerId))
        .where(
          and(gt(deaths.at, new Date(now.getTime() - mapDeathsWindowMs)), eq(players.hidden, false))
        )
        .orderBy(desc(deaths.at))
        .limit(200)
    : [];
  return {
    updated_at: state?.snapshotAt ? state.snapshotAt.toISOString() : null,
    players: online.flatMap((player) =>
      player.lastX !== null && player.lastY !== null
        ? [
            {
              id: player.id,
              name: displayName(player),
              level: player.level,
              guild_id: player.guildId,
              x: player.lastX,
              y: player.lastY,
              down: player.action === deathAction
            }
          ]
        : []
    ),
    bases: standing.map((row) => baseOf(row, names)),
    wild,
    deaths: recentDeaths.map(({ death, player }) => ({
      player: playerRef(player),
      at: death.at.toISOString(),
      x: death.x,
      y: death.y
    }))
  };
}

async function topBy(db: Database, value: SQL<number>, extra: SQL | null = null) {
  const rows = await db
    .select({ player: players, value })
    .from(players)
    .leftJoin(sessions, eq(sessions.id, players.currentSessionId))
    .where(and(eq(players.hidden, false), sql`${value} > 0`, extra ?? sql`true`))
    .orderBy(desc(value), asc(players.id))
    .limit(leaderboardSize);
  return rows.map((row) => ({
    player: playerRef(row.player),
    value: Math.round(Number(row.value))
  }));
}

export async function getLeaderboards(
  db: Database,
  features: Features,
  now = new Date()
): Promise<Leaderboards> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const nowText = now.toISOString();
  const weekText = weekAgo.toISOString();
  const weekValue = sql<number>`sum(extract(epoch from (least(coalesce(${sessions.leftAt}, ${nowText}::timestamptz), ${nowText}::timestamptz) - greatest(${sessions.joinedAt}, ${weekText}::timestamptz))))`;
  const weekRows = await db
    .select({ player: players, value: weekValue })
    .from(sessions)
    .innerJoin(players, eq(players.id, sessions.playerId))
    .where(
      and(
        eq(players.hidden, false),
        sql`coalesce(${sessions.leftAt}, ${nowText}::timestamptz) > ${weekText}::timestamptz`
      )
    )
    .groupBy(players.id)
    .orderBy(desc(weekValue), asc(players.id))
    .limit(leaderboardSize);
  const live = sql<number>`(${players.playtimeS} + coalesce(extract(epoch from (${nowText}::timestamptz - ${sessions.joinedAt})), 0))`;
  const [playtime, level, distance, died, chat] = await Promise.all([
    topBy(db, live),
    topBy(db, sql<number>`${players.level}`),
    features.positions ? topBy(db, sql<number>`${players.distanceM}`) : Promise.resolve([]),
    topBy(db, sql<number>`${players.deaths}`),
    features.chat ? topBy(db, sql<number>`${players.chatMessages}`) : Promise.resolve([])
  ]);
  return {
    playtime,
    playtime_week: weekRows
      .filter((row) => Number(row.value) > 0)
      .map((row) => ({ player: playerRef(row.player), value: Math.round(Number(row.value)) })),
    level,
    distance,
    deaths: died,
    chat
  };
}

function numberSetting(settings: Record<string, unknown> | null, key: string): number | null {
  const value = settings?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanSetting(settings: Record<string, unknown> | null, key: string): boolean | null {
  const value = settings?.[key];
  return typeof value === 'boolean' ? value : null;
}

export async function getWorld(db: Database, features: Features): Promise<World> {
  const state = await readServerState(db);
  const runs = await db
    .select({ settings: collectorRuns.settings })
    .from(collectorRuns)
    .where(sql`${collectorRuns.settings} is not null`)
    .orderBy(desc(collectorRuns.startedAt))
    .limit(1);
  const settings = runs[0]?.settings ?? null;
  const [totals] = await db
    .select({
      players: sql<number>`(select count(*) from ${players} where ${players.hidden} = false)::int`,
      guilds: sql<number>`(select count(distinct ${guildMembers.guildId}) from ${guildMembers} where ${guildMembers.current})::int`,
      bases: sql<number>`(select count(*) from ${bases} where ${bases.goneAt} is null)::int`,
      sessions: sql<number>`(select count(*) from ${sessions})::int`,
      playtime: sql<number>`(select coalesce(sum(${players.playtimeS}), 0) from ${players})::float8`,
      deaths: sql<number>`(select count(*) from ${deaths})::int`,
      levelUps: sql<number>`(select count(*) from ${levelUps})::int`,
      since: sql<Date | null>`(select min(${events.ts}) from ${events})`
    })
    .from(sql`(select 1) as one`);
  const deathPenalty = settings?.death_penalty;
  return {
    name: state?.serverName ?? null,
    description: state?.serverDescription ?? null,
    version: state?.serverVersion ?? null,
    settings: {
      exp_rate: numberSetting(settings, 'exp_rate'),
      pal_capture_rate: numberSetting(settings, 'pal_capture_rate'),
      death_penalty: typeof deathPenalty === 'string' ? deathPenalty : null,
      is_pvp: booleanSetting(settings, 'is_pvp'),
      is_hardcore: booleanSetting(settings, 'is_hardcore'),
      max_players: numberSetting(settings, 'server_player_max_num'),
      guild_player_max_num: numberSetting(settings, 'guild_player_max_num'),
      base_camp_max_num_in_guild: numberSetting(settings, 'base_camp_max_num_in_guild'),
      day_time_speed_rate: numberSetting(settings, 'day_time_speed_rate'),
      night_time_speed_rate: numberSetting(settings, 'night_time_speed_rate')
    },
    clock: {
      time: state?.inGameTime ?? null,
      day: state?.inGameDay ?? state?.days ?? null,
      observed_at: state?.inGameAt ? state.inGameAt.toISOString() : null,
      day_speed: state?.dayTimeSpeedRate ?? null,
      night_speed: state?.nightTimeSpeedRate ?? null
    },
    totals: {
      players: totals?.players ?? 0,
      guilds: totals?.guilds ?? 0,
      bases: features.bases ? (totals?.bases ?? 0) : null,
      sessions: totals?.sessions ?? 0,
      playtime_s: Math.round(totals?.playtime ?? 0),
      deaths: totals?.deaths ?? 0,
      level_ups: totals?.levelUps ?? 0
    },
    tracking_since: totals?.since ? new Date(totals.since).toISOString() : null
  };
}
