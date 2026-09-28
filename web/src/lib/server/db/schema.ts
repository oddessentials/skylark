import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const utc = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: utc('updated_at').notNull().defaultNow()
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: utc('updated_at').notNull().defaultNow()
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id').notNull(),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    ts: utc('ts').notNull(),
    receivedAt: utc('received_at').notNull().defaultNow(),
    data: jsonb('data').notNull(),
    source: text('source').notNull().default('collector'),
    invalid: text('invalid'),
    playerId: integer('player_id'),
    quiet: boolean('quiet').notNull().default(false)
  },
  (table) => [
    index('events_ts_seq_idx').on(table.ts, table.seq),
    index('events_type_ts_idx').on(table.type, table.ts),
    index('events_run_seq_idx').on(table.runId, table.seq),
    index('events_player_ts_idx').on(table.playerId, table.ts)
  ]
);

export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').primaryKey(),
    runId: uuid('run_id').notNull(),
    seq: integer('seq').notNull(),
    ts: utc('ts').notNull(),
    receivedAt: utc('received_at').notNull().defaultNow(),
    data: jsonb('data').notNull()
  },
  (table) => [index('snapshots_ts_idx').on(table.ts)]
);

export const serverMetrics = pgTable('server_metrics', {
  ts: utc('ts').primaryKey(),
  fps: doublePrecision('fps').notNull(),
  fpsAvg: doublePrecision('fps_avg'),
  frameTimeMs: doublePrecision('frame_time_ms').notNull(),
  players: integer('players').notNull(),
  maxPlayers: integer('max_players').notNull(),
  days: integer('days').notNull(),
  baseCamps: integer('base_camps').notNull(),
  uptimeS: doublePrecision('uptime_s').notNull()
});

export const collectorRuns = pgTable(
  'collector_runs',
  {
    runId: uuid('run_id').primaryKey(),
    startedAt: utc('started_at').notNull(),
    lastSeenAt: utc('last_seen_at').notNull(),
    lastSeq: integer('last_seq').notNull().default(0),
    stoppedAt: utc('stopped_at'),
    lostAt: utc('lost_at'),
    collectorName: text('collector_name'),
    collectorVersion: text('collector_version'),
    os: text('os'),
    arch: text('arch'),
    layers: jsonb('layers').$type<Record<string, unknown>>(),
    serverVersion: text('server_version'),
    serverName: text('server_name'),
    worldGuid: text('world_guid'),
    settings: jsonb('settings').$type<Record<string, unknown>>(),
    heartbeat: jsonb('heartbeat').$type<Record<string, unknown>>(),
    heartbeatAt: utc('heartbeat_at')
  },
  (table) => [index('collector_runs_started_idx').on(table.startedAt)]
);

export const serverState = pgTable('server_state', {
  id: integer('id').primaryKey(),
  online: boolean('online').notNull().default(false),
  onlineSince: utc('online_since'),
  offlineSince: utc('offline_since'),
  serverVersion: text('server_version'),
  serverName: text('server_name'),
  serverDescription: text('server_description'),
  worldGuid: text('world_guid'),
  playerCount: integer('player_count').notNull().default(0),
  maxPlayers: integer('max_players'),
  fps: doublePrecision('fps'),
  fpsAvg: doublePrecision('fps_avg'),
  frameTimeMs: doublePrecision('frame_time_ms'),
  uptimeS: doublePrecision('uptime_s'),
  days: integer('days'),
  baseCamps: integer('base_camps'),
  metricsAt: utc('metrics_at'),
  inGameTime: text('in_game_time'),
  inGameDay: integer('in_game_day'),
  inGameAt: utc('in_game_at'),
  dayTimeSpeedRate: doublePrecision('day_time_speed_rate'),
  nightTimeSpeedRate: doublePrecision('night_time_speed_rate'),
  snapshotAt: utc('snapshot_at'),
  snapshotSource: text('snapshot_source'),
  updatedAt: utc('updated_at').notNull().defaultNow()
});

export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    playerUid: text('player_uid'),
    platform: text('platform').notNull(),
    name: text('name').notNull(),
    accountName: text('account_name'),
    nameOverride: text('name_override'),
    hidden: boolean('hidden').notNull().default(false),
    firstSeen: utc('first_seen').notNull(),
    lastSeen: utc('last_seen').notNull(),
    online: boolean('online').notNull().default(false),
    currentSessionId: integer('current_session_id'),
    level: integer('level').notNull().default(0),
    guildId: text('guild_id'),
    lastX: doublePrecision('last_x'),
    lastY: doublePrecision('last_y'),
    lastZ: doublePrecision('last_z'),
    positionAt: utc('position_at'),
    hp: doublePrecision('hp'),
    maxHp: doublePrecision('max_hp'),
    action: text('action'),
    playtimeS: doublePrecision('playtime_s').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    distanceM: doublePrecision('distance_m').notNull().default(0),
    chatMessages: integer('chat_messages').notNull().default(0)
  },
  (table) => [
    uniqueIndex('players_user_id_idx').on(table.userId),
    index('players_player_uid_idx').on(table.playerUid),
    index('players_last_seen_idx').on(table.lastSeen)
  ]
);

export type SessionEndReason =
  'left' | 'server_offline' | 'collector_stopped' | 'collector_lost' | 'absent';

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').notNull(),
    runId: uuid('run_id').notNull(),
    joinedAt: utc('joined_at').notNull(),
    leftAt: utc('left_at'),
    durationS: doublePrecision('duration_s'),
    endReason: text('end_reason').$type<SessionEndReason>(),
    source: text('source').notNull(),
    joinEventId: uuid('join_event_id'),
    leftEventId: uuid('left_event_id'),
    levelStart: integer('level_start'),
    levelEnd: integer('level_end'),
    distanceM: doublePrecision('distance_m').notNull().default(0),
    deaths: integer('deaths').notNull().default(0)
  },
  (table) => [
    index('sessions_player_joined_idx').on(table.playerId, table.joinedAt),
    index('sessions_open_idx').on(table.leftAt)
  ]
);

export const positions = pgTable(
  'positions',
  {
    playerId: integer('player_id').notNull(),
    ts: utc('ts').notNull(),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    z: doublePrecision('z')
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.ts] }),
    index('positions_ts_idx').on(table.ts)
  ]
);

export const levelUps = pgTable(
  'level_ups',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    playerId: integer('player_id').notNull(),
    at: utc('at').notNull(),
    fromLevel: integer('from_level').notNull(),
    toLevel: integer('to_level').notNull()
  },
  (table) => [
    uniqueIndex('level_ups_event_idx').on(table.eventId),
    index('level_ups_player_at_idx').on(table.playerId, table.at)
  ]
);

export const deaths = pgTable(
  'deaths',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    playerId: integer('player_id').notNull(),
    at: utc('at').notNull(),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    z: doublePrecision('z'),
    source: text('source').notNull(),
    cause: text('cause'),
    killer: text('killer'),
    killerKind: text('killer_kind'),
    killerLevel: integer('killer_level'),
    mergedEventId: uuid('merged_event_id')
  },
  (table) => [
    uniqueIndex('deaths_event_idx').on(table.eventId),
    index('deaths_player_at_idx').on(table.playerId, table.at),
    index('deaths_at_idx').on(table.at)
  ]
);

export const feats = pgTable(
  'feats',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    playerId: integer('player_id').notNull(),
    at: utc('at').notNull(),
    kind: text('kind').notNull(),
    subject: text('subject').notNull(),
    level: integer('level'),
    detail: text('detail')
  },
  (table) => [
    uniqueIndex('feats_event_idx').on(table.eventId),
    index('feats_player_kind_idx').on(table.playerId, table.kind),
    index('feats_at_idx').on(table.at)
  ]
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    eventId: uuid('event_id').notNull(),
    at: utc('at').notNull(),
    playerId: integer('player_id'),
    channel: text('channel').notNull(),
    text: text('text').notNull(),
    guildName: text('guild_name')
  },
  (table) => [
    uniqueIndex('chat_messages_event_idx').on(table.eventId),
    index('chat_messages_at_idx').on(table.at)
  ]
);

export const guilds = pgTable('guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  firstSeen: utc('first_seen').notNull(),
  lastSeen: utc('last_seen').notNull()
});

export const guildMembers = pgTable(
  'guild_members',
  {
    guildId: text('guild_id').notNull(),
    playerId: integer('player_id').notNull(),
    firstSeen: utc('first_seen').notNull(),
    lastSeen: utc('last_seen').notNull(),
    current: boolean('current').notNull().default(true)
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.playerId] }),
    index('guild_members_player_idx').on(table.playerId)
  ]
);

export const bases = pgTable(
  'bases',
  {
    id: serial('id').primaryKey(),
    key: text('key').notNull(),
    guildId: text('guild_id'),
    name: text('name'),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    z: doublePrecision('z'),
    firstSeen: utc('first_seen').notNull(),
    lastSeen: utc('last_seen').notNull(),
    goneAt: utc('gone_at'),
    workers: integer('workers').notNull().default(0),
    workersSeenAt: utc('workers_seen_at')
  },
  (table) => [
    uniqueIndex('bases_key_idx').on(table.key),
    index('bases_guild_idx').on(table.guildId)
  ]
);

export const pals = pgTable(
  'pals',
  {
    instanceId: text('instance_id').primaryKey(),
    kind: text('kind').notNull(),
    className: text('class_name').notNull(),
    name: text('name'),
    level: integer('level').notNull(),
    hp: doublePrecision('hp'),
    maxHp: doublePrecision('max_hp'),
    ownerPlayerId: integer('owner_player_id'),
    guildId: text('guild_id'),
    baseId: integer('base_id'),
    action: text('action'),
    x: doublePrecision('x').notNull(),
    y: doublePrecision('y').notNull(),
    z: doublePrecision('z'),
    firstSeen: utc('first_seen').notNull(),
    seenAt: utc('seen_at').notNull()
  },
  (table) => [
    index('pals_owner_idx').on(table.ownerPlayerId),
    index('pals_guild_idx').on(table.guildId),
    index('pals_seen_idx').on(table.seenAt)
  ]
);

export interface SavedProgress {
  palpedia: number;
  palpedia_entries?: string[];
  species_captured: number;
  captures: number;
  species_captures?: Record<string, number>;
  tower_bosses: string[];
  field_bosses: number;
  dungeon_clears: number;
  fixed_dungeon_clears: number;
  technologies: number;
  fast_travel_points: number;
}

export interface SavedGuildMember {
  player_id: string;
  name: string;
  role: string;
}

export interface SavedWorker {
  instance_id: string;
  character_id: string;
  level: number;
  name: string | null;
}

export const playerSaves = pgTable('player_saves', {
  playerUid: text('player_uid').primaryKey(),
  savedAt: utc('saved_at').notNull(),
  name: text('name'),
  level: integer('level'),
  guildId: text('guild_id'),
  lastOnlineAt: utc('last_online_at'),
  progress: jsonb('progress').$type<SavedProgress | null>(),
  goneAt: utc('gone_at')
});

export const guildSaves = pgTable('guild_saves', {
  guildId: text('guild_id').primaryKey(),
  savedAt: utc('saved_at').notNull(),
  name: text('name').notNull(),
  baseCampLevel: integer('base_camp_level'),
  members: jsonb('members').$type<SavedGuildMember[]>().notNull(),
  goneAt: utc('gone_at')
});

export const baseSaves = pgTable('base_saves', {
  baseId: text('base_id').primaryKey(),
  savedAt: utc('saved_at').notNull(),
  guildId: text('guild_id'),
  name: text('name'),
  x: doublePrecision('x').notNull(),
  y: doublePrecision('y').notNull(),
  z: doublePrecision('z'),
  workers: jsonb('workers').$type<SavedWorker[]>().notNull(),
  goneAt: utc('gone_at')
});

export interface SavedHatchling {
  species: string;
  alpha: boolean;
  gender: string | null;
  level: number;
  rank: number;
  talents: { hp: number; shot: number; defense: number };
  passives: string[];
  lucky: boolean;
}

export const palSaves = pgTable(
  'pal_saves',
  {
    instanceId: text('instance_id').primaryKey(),
    playerUid: text('player_uid').notNull(),
    savedAt: utc('saved_at').notNull(),
    place: text('place').notNull(),
    species: text('species').notNull(),
    alpha: boolean('alpha').notNull(),
    gender: text('gender'),
    level: integer('level').notNull(),
    rank: integer('rank').notNull(),
    talentHp: integer('talent_hp').notNull(),
    talentShot: integer('talent_shot').notNull(),
    talentDefense: integer('talent_defense').notNull(),
    passives: jsonb('passives').$type<string[]>().notNull(),
    lucky: boolean('lucky').notNull(),
    name: text('name'),
    goneAt: utc('gone_at')
  },
  (table) => [index('pal_saves_player_idx').on(table.playerUid)]
);

export const eggSaves = pgTable(
  'egg_saves',
  {
    eggId: text('egg_id').primaryKey(),
    savedAt: utc('saved_at').notNull(),
    playerUid: text('player_uid'),
    baseId: text('base_id'),
    place: text('place').notNull(),
    objectId: text('object_id'),
    itemId: text('item_id').notNull(),
    species: text('species').notNull(),
    alpha: boolean('alpha').notNull(),
    hatched: jsonb('hatched').$type<SavedHatchling | null>(),
    goneAt: utc('gone_at')
  },
  (table) => [
    index('egg_saves_player_idx').on(table.playerUid),
    index('egg_saves_base_idx').on(table.baseId)
  ]
);

export const worldLive = pgTable('world_live', {
  id: integer('id').primaryKey(),
  snapshotAt: utc('snapshot_at').notNull(),
  wild: jsonb('wild').$type<Record<string, unknown>[]>().notNull().default([])
});

export type ServerStatusState = 'online' | 'offline' | 'unknown';

export const statusSamples = pgTable('status_samples', {
  ts: utc('ts').primaryKey(),
  state: text('state').$type<ServerStatusState>().notNull(),
  players: integer('players').notNull(),
  fps: doublePrecision('fps')
});

export type ActionKind = 'announce' | 'kick' | 'ban' | 'unban' | 'save' | 'shutdown';

export const actions = pgTable(
  'actions',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').$type<ActionKind>().notNull(),
    message: text('message'),
    userId: text('user_id'),
    waittimeS: integer('waittime_s'),
    notBefore: utc('not_before'),
    createdAt: utc('created_at').notNull().defaultNow(),
    deliveredAt: utc('delivered_at'),
    completedAt: utc('completed_at'),
    failedAt: utc('failed_at'),
    error: text('error'),
    cancelledAt: utc('cancelled_at')
  },
  (table) => [index('actions_created_idx').on(table.createdAt)]
);

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(),
  state: text('state').notNull().default('queued'),
  createdAt: utc('created_at').notNull().defaultNow(),
  startedAt: utc('started_at'),
  finishedAt: utc('finished_at'),
  progress: doublePrecision('progress'),
  error: text('error')
});

export const backups = pgTable('backups', {
  id: serial('id').primaryKey(),
  at: utc('at').notNull().defaultNow(),
  file: text('file').notNull(),
  sizeBytes: doublePrecision('size_bytes').notNull().default(0),
  ok: boolean('ok').notNull(),
  error: text('error')
});

export const ingestBatches = pgTable(
  'ingest_batches',
  {
    id: serial('id').primaryKey(),
    receivedAt: utc('received_at').notNull().defaultNow(),
    status: integer('status').notNull(),
    accepted: integer('accepted').notNull().default(0),
    duplicates: integer('duplicates').notNull().default(0),
    invalid: integer('invalid').notNull().default(0),
    events: integer('events').notNull().default(0)
  },
  (table) => [index('ingest_batches_received_idx').on(table.receivedAt)]
);

export const adminSessions = pgTable('admin_sessions', {
  id: text('id').primaryKey(),
  createdAt: utc('created_at').notNull().defaultNow(),
  expiresAt: utc('expires_at').notNull()
});

export type EventRow = typeof events.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ServerStateRow = typeof serverState.$inferSelect;
export type CollectorRunRow = typeof collectorRuns.$inferSelect;
export type ActionRow = typeof actions.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type PalRow = typeof pals.$inferSelect;
export type BaseRow = typeof bases.$inferSelect;
export type PlayerSaveRow = typeof playerSaves.$inferSelect;
export type GuildSaveRow = typeof guildSaves.$inferSelect;
export type BaseSaveRow = typeof baseSaves.$inferSelect;
export type PalSaveRow = typeof palSaves.$inferSelect;
export type EggSaveRow = typeof eggSaves.$inferSelect;

export const projectionTables = [
  sessions,
  levelUps,
  deaths,
  feats,
  chatMessages,
  playerSaves,
  guildSaves,
  baseSaves,
  palSaves,
  eggSaves
] as const;
