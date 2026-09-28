import { and, desc, eq, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type {
  Action,
  ActionCreate,
  AdminEvent,
  AdminHealth,
  AdminPlayer,
  CollectorAdmin,
  CollectorRun
} from '$lib/api/types';
import { secrets } from '../auth/secrets';
import type { Database } from '../db/client';
import {
  actions,
  collectorRuns,
  events,
  players,
  positions,
  sessions,
  type ActionRow,
  type CollectorRunRow,
  type PlayerRow
} from '../db/schema';
import { badRequest, conflict, notFound, type KeysetPage, type Page } from '../http/respond';
import { actionRedeliveryMs, ingestStats } from '../ingest/ingest';
import { backupSummary } from '../jobs/backup';
import type { JobStatus } from '../jobs/scheduler';
import { displayName, platformName, playerRef, playersById, secondsBetween } from './common';
import { collectorStateOf, latestRun } from './status';

export const actionListSize = 50;

export function runOf(row: CollectorRunRow): CollectorRun {
  return {
    run_id: row.runId,
    name: row.collectorName,
    version: row.collectorVersion,
    os: row.os,
    arch: row.arch,
    started_at: row.startedAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
    stopped_at: row.stoppedAt ? row.stoppedAt.toISOString() : null,
    lost_at: row.lostAt ? row.lostAt.toISOString() : null,
    last_seq: row.lastSeq,
    layers: row.layers ?? null,
    server_version: row.serverVersion,
    world_guid: row.worldGuid,
    heartbeat: row.heartbeat ?? null,
    heartbeat_at: row.heartbeatAt ? row.heartbeatAt.toISOString() : null
  };
}

async function ingestCounters(now: Date) {
  const stats = await ingestStats(new Date(now.getTime() - 24 * 3600 * 1000));
  return {
    last_batch_at: stats.lastBatchAt ? stats.lastBatchAt.toISOString() : null,
    batches_24h: stats.batches,
    events_24h: stats.events,
    duplicates_24h: stats.duplicates,
    invalid_24h: stats.invalid,
    rejected_24h: stats.rejected
  };
}

export async function collectorAdmin(db: Database, now = new Date()): Promise<CollectorAdmin> {
  const runs = await db
    .select()
    .from(collectorRuns)
    .orderBy(desc(collectorRuns.startedAt))
    .limit(10);
  return {
    site_version: __APP_VERSION__,
    secret: await secrets.collectorSecret(),
    secret_from_environment: secrets.collectorSecretFromEnvironment(),
    runs: runs.map(runOf),
    ingest: await ingestCounters(now)
  };
}

function adminPlayerOf(row: PlayerRow, joinedAt: Date | null, now: Date): AdminPlayer {
  return {
    id: row.id,
    name: displayName(row),
    game_name: row.name,
    name_override: row.nameOverride,
    user_id: row.userId,
    player_uid: row.playerUid,
    account_name: row.accountName,
    platform: platformName(row.platform),
    level: row.level,
    hidden: row.hidden,
    online: row.online,
    first_seen: row.firstSeen.toISOString(),
    last_seen: row.lastSeen.toISOString(),
    playtime_s: Math.round(row.playtimeS + (joinedAt ? secondsBetween(joinedAt, now) : 0)),
    sessions: row.sessions
  };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listAdminPlayers(
  db: Database,
  search: string | null,
  page: Page,
  now = new Date()
): Promise<AdminPlayer[]> {
  const conditions: SQL[] = [];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(players.name, pattern),
        ilike(players.nameOverride, pattern),
        ilike(players.accountName, pattern),
        ilike(players.userId, pattern)
      )!
    );
  }
  const rows = await db
    .select({ player: players, joinedAt: sessions.joinedAt })
    .from(players)
    .leftJoin(sessions, eq(sessions.id, players.currentSessionId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(players.online), desc(players.lastSeen), desc(players.id))
    .limit(page.limit + 1)
    .offset(page.offset);
  return rows.map((row) => adminPlayerOf(row.player, row.joinedAt, now));
}

export interface PlayerPatch {
  nameOverride?: string | null;
  hidden?: boolean;
}

export function parsePlayerPatch(body: unknown): PlayerPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  const patch: PlayerPatch = {};
  for (const key of Object.keys(record)) {
    if (key !== 'name_override' && key !== 'hidden') throw badRequest(`${key} cannot be changed`);
  }
  if ('name_override' in record) {
    const value = record.name_override;
    if (value === null) patch.nameOverride = null;
    else if (typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 64) {
      patch.nameOverride = value.trim();
    } else {
      throw badRequest('name_override must be null or 1 to 64 characters');
    }
  }
  if ('hidden' in record) {
    if (typeof record.hidden !== 'boolean') throw badRequest('hidden must be true or false');
    patch.hidden = record.hidden;
  }
  return patch;
}

export async function updateAdminPlayer(
  db: Database,
  id: number,
  patch: PlayerPatch,
  now = new Date()
): Promise<AdminPlayer> {
  const values: Partial<typeof players.$inferInsert> = {};
  if (patch.nameOverride !== undefined) values.nameOverride = patch.nameOverride;
  if (patch.hidden !== undefined) values.hidden = patch.hidden;
  const rows =
    Object.keys(values).length > 0
      ? await db.update(players).set(values).where(eq(players.id, id)).returning()
      : await db.select().from(players).where(eq(players.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw notFound(`player ${id} does not exist`);
  const open = row.currentSessionId
    ? await db
        .select({ joinedAt: sessions.joinedAt })
        .from(sessions)
        .where(eq(sessions.id, row.currentSessionId))
        .limit(1)
    : [];
  return adminPlayerOf(row, open[0]?.joinedAt ?? null, now);
}

export function actionStateOf(row: ActionRow, now: Date): Action['state'] {
  if (row.cancelledAt) return 'cancelled';
  if (row.completedAt) return 'done';
  if (row.failedAt) return 'failed';
  if (row.deliveredAt) {
    return now.getTime() - row.deliveredAt.getTime() > actionRedeliveryMs ? 'expired' : 'sent';
  }
  return 'queued';
}

export async function actionsOf(
  db: Database,
  rows: ActionRow[],
  now = new Date()
): Promise<Action[]> {
  const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => !!id))];
  const people = new Map<string, PlayerRow>();
  if (userIds.length > 0) {
    const found = await db.select().from(players).where(inArray(players.userId, userIds));
    for (const row of found) people.set(row.userId, row);
  }
  return rows.map((row) => {
    const person = row.userId ? people.get(row.userId) : undefined;
    return {
      id: row.id,
      kind: row.kind,
      state: actionStateOf(row, now),
      message: row.message,
      player: person ? playerRef(person) : null,
      user_id: row.userId,
      waittime_s: row.waittimeS,
      not_before: row.notBefore ? row.notBefore.toISOString() : null,
      created_at: row.createdAt.toISOString(),
      delivered_at: row.deliveredAt ? row.deliveredAt.toISOString() : null,
      finished_at: (row.completedAt ?? row.failedAt ?? row.cancelledAt)?.toISOString() ?? null,
      error: row.error
    };
  });
}

export async function listActions(db: Database, now = new Date()): Promise<Action[]> {
  const rows = await db.select().from(actions).orderBy(desc(actions.id)).limit(actionListSize);
  return actionsOf(db, rows, now);
}

const actionKinds = ['announce', 'kick', 'ban', 'unban', 'save', 'shutdown'] as const;

export function parseActionCreate(body: unknown): ActionCreate {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('body must be a JSON object');
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set(['kind', 'message', 'player_id', 'user_id', 'waittime_s', 'delay_s']);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw badRequest(`${key} is not an action field`);
  }
  const kind = record.kind;
  if (typeof kind !== 'string' || !(actionKinds as readonly string[]).includes(kind)) {
    throw badRequest(`kind must be one of ${actionKinds.join(', ')}`);
  }
  const create: ActionCreate = { kind: kind as ActionCreate['kind'] };
  if (record.message !== undefined) {
    if (typeof record.message !== 'string') throw badRequest('message must be a string');
    const message = record.message.trim();
    if (message.length < 1 || message.length > 200) {
      throw badRequest('message must be 1 to 200 characters');
    }
    create.message = message;
  }
  if (record.player_id !== undefined) {
    if (!Number.isInteger(record.player_id) || (record.player_id as number) < 1) {
      throw badRequest('player_id must be a positive integer');
    }
    create.player_id = record.player_id as number;
  }
  if (record.user_id !== undefined) {
    if (
      typeof record.user_id !== 'string' ||
      record.user_id.length < 1 ||
      record.user_id.length > 128
    ) {
      throw badRequest('user_id must be 1 to 128 characters');
    }
    create.user_id = record.user_id;
  }
  for (const [key, max] of [
    ['waittime_s', 3600],
    ['delay_s', 604800]
  ] as const) {
    const value = record[key];
    if (value === undefined) continue;
    const min = key === 'waittime_s' ? 1 : 0;
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
      throw badRequest(`${key} must be an integer from ${min} to ${max}`);
    }
    create[key] = value as number;
  }
  if (create.kind === 'announce' && !create.message) throw badRequest('announce needs a message');
  if (create.kind === 'shutdown' && create.waittime_s === undefined) {
    throw badRequest('shutdown needs waittime_s');
  }
  const targeted = create.kind === 'kick' || create.kind === 'ban' || create.kind === 'unban';
  if (targeted && create.player_id === undefined && create.user_id === undefined) {
    throw badRequest(`${create.kind} needs player_id or user_id`);
  }
  if (!targeted && (create.player_id !== undefined || create.user_id !== undefined)) {
    throw badRequest(`${create.kind} does not take a player`);
  }
  return create;
}

export async function createAction(
  db: Database,
  create: ActionCreate,
  now = new Date()
): Promise<Action> {
  let userId = create.user_id ?? null;
  if (create.player_id !== undefined) {
    const rows = await db
      .select({ userId: players.userId })
      .from(players)
      .where(eq(players.id, create.player_id))
      .limit(1);
    if (!rows[0]) throw notFound(`player ${create.player_id} does not exist`);
    userId = rows[0].userId;
  }
  const inserted = await db
    .insert(actions)
    .values({
      kind: create.kind,
      message: create.message ?? null,
      userId,
      waittimeS: create.kind === 'shutdown' ? (create.waittime_s ?? null) : null,
      notBefore: create.delay_s ? new Date(now.getTime() + create.delay_s * 1000) : null,
      createdAt: now
    })
    .returning();
  return (await actionsOf(db, inserted, now))[0]!;
}

export async function cancelAction(db: Database, id: number, now = new Date()): Promise<Action> {
  const rows = await db.select().from(actions).where(eq(actions.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw notFound(`action ${id} does not exist`);
  if (row.cancelledAt) return (await actionsOf(db, [row], now))[0]!;
  if (row.deliveredAt || row.completedAt || row.failedAt) {
    throw conflict('the collector has already picked this action up');
  }
  const updated = await db
    .update(actions)
    .set({ cancelledAt: now })
    .where(eq(actions.id, id))
    .returning();
  return (await actionsOf(db, updated, now))[0]!;
}

export interface EventQuery {
  type: string | null;
  invalid: boolean | null;
  playerId: number | null;
  page: KeysetPage;
}

export async function listAdminEvents(db: Database, query: EventQuery): Promise<AdminEvent[]> {
  const conditions: SQL[] = [];
  if (query.type) conditions.push(eq(events.type, query.type));
  if (query.invalid === true) conditions.push(sql`${events.invalid} is not null`);
  if (query.invalid === false) conditions.push(sql`${events.invalid} is null`);
  if (query.playerId !== null) conditions.push(eq(events.playerId, query.playerId));
  const after = query.page.after;
  if (after) {
    conditions.push(
      or(lt(events.ts, after.ts), and(eq(events.ts, after.ts), lt(events.id, after.id)))!
    );
  }
  const rows = await db
    .select()
    .from(events)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(events.ts), desc(events.id))
    .limit(query.page.limit + 1);
  const people = await playersById(
    db,
    rows.map((row) => row.playerId)
  );
  return rows.map((row) => {
    const person = row.playerId !== null ? people.get(row.playerId) : undefined;
    return {
      id: row.id,
      type: row.type,
      ts: row.ts.toISOString(),
      received_at: row.receivedAt.toISOString(),
      source: row.source === 'site' ? 'site' : 'collector',
      run_id: row.runId,
      seq: row.seq,
      invalid: row.invalid,
      quiet: row.quiet,
      player: person ? playerRef(person) : null,
      data: row.data as Record<string, unknown>
    };
  });
}

function heartbeatText(heartbeat: Record<string, unknown> | null, key: string): string | null {
  const value = heartbeat?.[key];
  return typeof value === 'string' ? value : null;
}

function heartbeatNumber(heartbeat: Record<string, unknown> | null, key: string): number | null {
  const value = heartbeat?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function adminHealth(
  db: Database,
  jobStatuses: JobStatus[],
  now = new Date()
): Promise<AdminHealth> {
  const run = await latestRun(db);
  const heartbeat = run?.heartbeat ?? null;
  const [counts] = await db
    .select({
      events: sql<number>`(select count(*) from ${events})::int`,
      positions: sql<number>`(select count(*) from ${positions})::int`,
      size: sql<number>`pg_database_size(current_database())::float8`
    })
    .from(sql`(select 1) as one`);
  return {
    collector: {
      state: collectorStateOf(run, now),
      run: run ? runOf(run) : null,
      heartbeat_age_s: run?.heartbeatAt ? Math.round(secondsBetween(run.heartbeatAt, now)) : null,
      queue_depth: heartbeatNumber(heartbeat, 'queue_depth'),
      dropped_events: heartbeatNumber(heartbeat, 'dropped_events'),
      rest: heartbeatText(heartbeat, 'rest'),
      gamedata: heartbeatText(heartbeat, 'gamedata'),
      logs: heartbeatText(heartbeat, 'logs')
    },
    ingest: await ingestCounters(now),
    db: {
      events_total: counts?.events ?? 0,
      positions_total: counts?.positions ?? 0,
      size_mb: Math.round(((counts?.size ?? 0) / 1024 / 1024) * 10) / 10
    },
    backup: await backupSummary(db),
    jobs: jobStatuses.map((job) => ({
      name: job.name,
      last_run_at: job.lastRunAt,
      last_ok: job.lastOk,
      last_error: job.lastError
    }))
  };
}
