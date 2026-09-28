import { createHash } from 'node:crypto';
import { and, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { components } from '$lib/api/types';
import {
  actions,
  chatMessages,
  collectorRuns,
  deaths,
  events,
  levelUps,
  players,
  serverMetrics
} from '../db/schema';
import {
  findPlayer,
  loadServerState,
  parseInstant,
  resolvePlayer,
  updatePlayer,
  updateServerState,
  type ProjectionContext,
  type StoredEvent
} from './context';
import {
  bumpSessionCounter,
  closeAllSessions,
  closeSession,
  openSession,
  relabelAbsentSession,
  type SessionSource
} from './sessions';
import { applySaveBase, applySaveGuild, applySavePlayer, applySaveRead } from './saves';

type Schemas = components['schemas'];

export interface EventOutcome {
  playerId: number | null;
  quiet: boolean;
}

const plain: EventOutcome = { playerId: null, quiet: false };

export const leftRelabelWindowMs = 180_000;

export const siteEventTypes = [
  'collector.lost',
  'player.joined',
  'player.left',
  'base.established',
  'base.removed',
  'guild.renamed',
  'player.guild_joined'
] as const;

export type SiteEventType = (typeof siteEventTypes)[number];

async function collectorStarted(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['CollectorStartedData'];
  const server = data.server ?? null;
  const settings = data.settings ?? null;
  if (!ctx.rebuild) {
    const values = {
      collectorVersion: data.collector_version,
      os: data.os,
      arch: data.arch,
      layers: data.layers as unknown as Record<string, unknown>,
      serverVersion: server?.version ?? null,
      serverName: server?.name ?? null,
      worldGuid: server?.world_guid ?? null,
      settings: settings as unknown as Record<string, unknown> | null
    };
    await ctx.tx
      .insert(collectorRuns)
      .values({ runId: event.run_id, startedAt: ts, lastSeenAt: ctx.receivedAt, ...values })
      .onConflictDoUpdate({
        target: collectorRuns.runId,
        set: {
          startedAt: sql`least(${collectorRuns.startedAt}, ${ts.toISOString()}::timestamptz)`,
          ...values
        }
      });
    await ctx.tx
      .update(collectorRuns)
      .set({ stoppedAt: ts })
      .where(
        and(
          ne(collectorRuns.runId, event.run_id),
          isNull(collectorRuns.stoppedAt),
          lt(collectorRuns.startedAt, ts)
        )
      );
  }
  const patch: Parameters<typeof updateServerState>[1] = {};
  if (server) {
    patch.serverVersion = server.version;
    patch.serverName = server.name;
    patch.serverDescription = server.description ?? null;
    patch.worldGuid = server.world_guid;
  }
  if (settings) {
    patch.dayTimeSpeedRate = settings.day_time_speed_rate;
    patch.nightTimeSpeedRate = settings.night_time_speed_rate;
    patch.maxPlayers = settings.server_player_max_num;
  }
  if (Object.keys(patch).length > 0) {
    await updateServerState(ctx, patch);
    ctx.effects.statusChanged = true;
  }
  return plain;
}

async function serverOnline(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ServerOnlineData'];
  const state = await loadServerState(ctx);
  const transition = !state.online;
  const settings = data.settings ?? null;
  await updateServerState(ctx, {
    online: true,
    onlineSince: transition ? ts : state.onlineSince,
    offlineSince: transition ? null : state.offlineSince,
    serverVersion: data.version,
    serverName: data.name,
    serverDescription: data.description ?? null,
    worldGuid: data.world_guid,
    ...(settings
      ? {
          dayTimeSpeedRate: settings.day_time_speed_rate,
          nightTimeSpeedRate: settings.night_time_speed_rate,
          maxPlayers: settings.server_player_max_num
        }
      : {})
  });
  if (settings && !ctx.rebuild) {
    await ctx.tx
      .update(collectorRuns)
      .set({ settings: settings as unknown as Record<string, unknown> })
      .where(eq(collectorRuns.runId, event.run_id));
  }
  ctx.effects.statusChanged = true;
  return { playerId: null, quiet: !transition };
}

async function serverOffline(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ServerOfflineData'];
  ctx.effects.statusChanged = true;
  if (data.reason === 'collector_stopping') {
    if (!ctx.rebuild) {
      await ctx.tx
        .update(collectorRuns)
        .set({ stoppedAt: ts })
        .where(and(eq(collectorRuns.runId, event.run_id), isNull(collectorRuns.stoppedAt)));
    }
    await closeAllSessions(ctx, ts, 'collector_stopped');
    return { playerId: null, quiet: true };
  }
  const state = await loadServerState(ctx);
  const transition = state.online;
  if (transition) await updateServerState(ctx, { online: false, offlineSince: ts, playerCount: 0 });
  await closeAllSessions(ctx, ts, 'server_offline');
  return { playerId: null, quiet: !transition };
}

async function playerConnected(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerConnectedData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, { name: data.name });
  return { playerId: player.id, quiet: true };
}

function sessionSource(event: StoredEvent, declared: unknown): SessionSource {
  if (event.source === 'site') return 'site';
  return declared === 'log' || declared === 'rest' ? declared : 'log';
}

async function playerJoined(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerJoinedData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, {
    name: data.name,
    playerUid: data.player_id
  });
  const result = await openSession(
    ctx,
    player,
    ts,
    sessionSource(event, data.source),
    event.run_id,
    event.id
  );
  const quiet = event.source === 'site' || !(result.opened || result.tookOver);
  return { playerId: player.id, quiet };
}

async function playerLeft(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerLeftData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, {
    name: data.name,
    playerUid: data.player_id
  });
  if (event.source === 'site') {
    await closeSession(ctx, player, ts, 'absent', event.id);
    return { playerId: player.id, quiet: true };
  }
  if (await closeSession(ctx, player, ts, 'left', event.id)) {
    return { playerId: player.id, quiet: false };
  }
  const relabelled = await relabelAbsentSession(ctx, player, ts, event.id, leftRelabelWindowMs);
  return { playerId: player.id, quiet: !relabelled };
}

async function playerLevelUp(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerLevelUpData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, {
    name: data.name,
    playerUid: data.player_id
  });
  await ctx.tx
    .insert(levelUps)
    .values({
      eventId: event.id,
      playerId: player.id,
      at: ts,
      fromLevel: data.from,
      toLevel: data.to
    })
    .onConflictDoNothing();
  if (data.to > player.level) await updatePlayer(ctx, player, { level: data.to });
  return { playerId: player.id, quiet: false };
}

async function playerDied(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['PlayerDiedData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, {
    name: data.name,
    playerUid: data.player_id
  });
  const inserted = await ctx.tx
    .insert(deaths)
    .values({
      eventId: event.id,
      playerId: player.id,
      at: ts,
      x: data.x,
      y: data.y,
      z: data.z ?? null,
      source: data.source,
      cause: data.cause ?? null,
      killer: data.killer ?? null
    })
    .onConflictDoNothing()
    .returning({ id: deaths.id });
  if (inserted.length > 0) {
    await updatePlayer(ctx, player, { deaths: sql`${players.deaths} + 1` });
    await bumpSessionCounter(ctx, player, 'deaths');
  }
  return { playerId: player.id, quiet: false };
}

async function chatMessage(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ChatMessageData'];
  const player = await resolvePlayer(ctx, data.user_id, ts, { name: data.name });
  const inserted = await ctx.tx
    .insert(chatMessages)
    .values({
      eventId: event.id,
      at: ts,
      playerId: player.id,
      channel: data.channel,
      text: data.text,
      guildName: data.guild_name ?? null
    })
    .onConflictDoNothing()
    .returning({ id: chatMessages.id });
  if (inserted.length > 0) {
    await updatePlayer(ctx, player, { chatMessages: sql`${players.chatMessages} + 1` });
  }
  return { playerId: player.id, quiet: false };
}

async function moderation(ctx: ProjectionContext, event: StoredEvent): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ModerationData'];
  const player = await findPlayer(ctx, data.user_id);
  return { playerId: player?.id ?? null, quiet: false };
}

async function actionResult(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as unknown as Schemas['ActionFailedData'];
  const unfinished = and(
    eq(actions.id, data.action_id),
    isNull(actions.completedAt),
    isNull(actions.failedAt)
  );
  if (event.type === 'action.completed') {
    await ctx.tx.update(actions).set({ completedAt: ts }).where(unfinished);
  } else {
    await ctx.tx
      .update(actions)
      .set({ failedAt: ts, error: String(data.error ?? 'failed').slice(0, 500) })
      .where(unfinished);
  }
  return plain;
}

async function collectorLost(
  ctx: ProjectionContext,
  event: StoredEvent,
  ts: Date
): Promise<EventOutcome> {
  const data = event.data as { run_id?: string; last_seen_at?: string };
  const lastSeen = data.last_seen_at ? parseInstant(data.last_seen_at) : ts;
  if (!ctx.rebuild && data.run_id) {
    await ctx.tx
      .update(collectorRuns)
      .set({ lostAt: ts })
      .where(and(eq(collectorRuns.runId, data.run_id), isNull(collectorRuns.lostAt)));
  }
  await closeAllSessions(ctx, lastSeen, 'collector_lost');
  ctx.effects.statusChanged = true;
  return plain;
}

async function guildJoined(ctx: ProjectionContext, event: StoredEvent): Promise<EventOutcome> {
  const data = event.data as { user_id?: string };
  const player = data.user_id ? await findPlayer(ctx, data.user_id) : null;
  return { playerId: player?.id ?? null, quiet: false };
}

export async function applyEvent(
  ctx: ProjectionContext,
  event: StoredEvent
): Promise<EventOutcome> {
  const ts = parseInstant(event.ts);
  switch (event.type) {
    case 'collector.started':
      return collectorStarted(ctx, event, ts);
    case 'server.online':
      return serverOnline(ctx, event, ts);
    case 'server.offline':
      return serverOffline(ctx, event, ts);
    case 'player.connected':
      return playerConnected(ctx, event, ts);
    case 'player.joined':
      return playerJoined(ctx, event, ts);
    case 'player.left':
      return playerLeft(ctx, event, ts);
    case 'player.level_up':
      return playerLevelUp(ctx, event, ts);
    case 'player.died':
      return playerDied(ctx, event, ts);
    case 'chat.message':
      return chatMessage(ctx, event, ts);
    case 'player.kicked':
    case 'player.banned':
    case 'player.unbanned':
      return moderation(ctx, event);
    case 'action.completed':
    case 'action.failed':
      return actionResult(ctx, event, ts);
    case 'collector.lost':
      return collectorLost(ctx, event, ts);
    case 'player.guild_joined':
      return guildJoined(ctx, event);
    case 'save.player':
      return applySavePlayer(ctx, event);
    case 'save.guild':
      return applySaveGuild(ctx, event);
    case 'save.base':
      return applySaveBase(ctx, event);
    case 'save.read':
      return applySaveRead(ctx, event);
    default:
      return plain;
  }
}

export async function markEvent(
  ctx: ProjectionContext,
  id: string,
  outcome: EventOutcome
): Promise<void> {
  if (outcome.playerId === null && !outcome.quiet) return;
  await ctx.tx
    .update(events)
    .set({ playerId: outcome.playerId, quiet: outcome.quiet })
    .where(eq(events.id, id));
}

export function siteEventId(
  type: string,
  runId: string,
  seq: number,
  ts: Date,
  data: Record<string, unknown>
): string {
  const hex = createHash('sha256')
    .update(`${type}|${runId}|${seq}|${ts.toISOString()}|${JSON.stringify(data)}`)
    .digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function emitSiteEvent(
  ctx: ProjectionContext,
  type: SiteEventType,
  ts: Date,
  runId: string,
  seq: number,
  data: Record<string, unknown>
): Promise<StoredEvent | null> {
  if (ctx.rebuild) return null;
  const event: StoredEvent = {
    id: siteEventId(type, runId, seq, ts, data),
    seq,
    run_id: runId,
    ts: ts.toISOString(),
    type,
    data,
    source: 'site'
  };
  const inserted = await ctx.tx
    .insert(events)
    .values({
      id: event.id,
      runId,
      seq,
      type,
      ts,
      receivedAt: ctx.receivedAt,
      data,
      source: 'site'
    })
    .onConflictDoNothing()
    .returning({ id: events.id });
  if (inserted.length === 0) return null;
  await markEvent(ctx, event.id, await applyEvent(ctx, event));
  ctx.effects.siteEvents.push(event);
  return event;
}

export async function applyMetrics(ctx: ProjectionContext, event: StoredEvent): Promise<boolean> {
  const data = event.data as unknown as Schemas['ServerMetricsData'];
  const ts = parseInstant(event.ts);
  const inserted = await ctx.tx
    .insert(serverMetrics)
    .values({
      ts,
      fps: data.fps,
      fpsAvg: data.fps_avg ?? null,
      frameTimeMs: data.frame_time_ms,
      players: data.players,
      maxPlayers: data.max_players,
      days: data.days,
      baseCamps: data.base_camps,
      uptimeS: data.uptime_s
    })
    .onConflictDoNothing()
    .returning({ ts: serverMetrics.ts });
  if (inserted.length === 0) return false;
  const state = await loadServerState(ctx);
  if (!state.metricsAt || ts > state.metricsAt) {
    await updateServerState(ctx, {
      fps: data.fps,
      fpsAvg: data.fps_avg ?? null,
      frameTimeMs: data.frame_time_ms,
      playerCount: data.players,
      maxPlayers: data.max_players,
      days: data.days,
      baseCamps: data.base_camps,
      uptimeS: data.uptime_s,
      metricsAt: ts
    });
    ctx.effects.statusChanged = true;
  }
  return true;
}

export async function applyHeartbeat(ctx: ProjectionContext, event: StoredEvent): Promise<boolean> {
  const ts = parseInstant(event.ts);
  const updated = await ctx.tx
    .update(collectorRuns)
    .set({ heartbeat: event.data, heartbeatAt: ts })
    .where(
      and(
        eq(collectorRuns.runId, event.run_id),
        or(isNull(collectorRuns.heartbeatAt), lt(collectorRuns.heartbeatAt, ts))
      )
    )
    .returning({ runId: collectorRuns.runId });
  return updated.length > 0;
}
