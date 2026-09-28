export interface paths {
  '/api/ingest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['ingestBatch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/openapi.json': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOpenApi'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/site': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getSite'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    ActionCompletedData: {
      action_id: number;
      kind: string;
    } & {
      [key: string]: unknown;
    };
    ActionCompletedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ActionCompletedData'];
      type: 'action.completed';
    };
    ActionFailedData: {
      action_id: number;
      error: string;
      kind: string;
    } & {
      [key: string]: unknown;
    };
    ActionFailedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ActionFailedData'];
      type: 'action.failed';
    };
    AdminCommandData: {
      actor: string;
      details: string[];
      user_id?: string | null;
    } & {
      [key: string]: unknown;
    };
    AdminCommandEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['AdminCommandData'];
      type: 'admin.command';
    };
    ChatMessageData: {
      channel: string;
      guild_name?: string | null;
      name: string;
      text: string;
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    ChatMessageEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ChatMessageData'];
      type: 'chat.message';
    };
    CollectorAction: {
      id: number;
      kind: 'announce' | 'kick' | 'ban' | 'unban' | 'save' | 'shutdown';
      message: string | null;
      user_id: components['schemas']['UserId'] | null;
      waittime_s: number | null;
    };
    CollectorEvent:
      | components['schemas']['CollectorStartedEvent']
      | components['schemas']['CollectorHeartbeatEvent']
      | components['schemas']['ServerOnlineEvent']
      | components['schemas']['ServerOfflineEvent']
      | components['schemas']['ServerMetricsEvent']
      | components['schemas']['WorldSnapshotEvent']
      | components['schemas']['PlayerConnectedEvent']
      | components['schemas']['PlayerJoinedEvent']
      | components['schemas']['PlayerLeftEvent']
      | components['schemas']['PlayerLevelUpEvent']
      | components['schemas']['PlayerDiedEvent']
      | components['schemas']['ChatMessageEvent']
      | components['schemas']['AdminCommandEvent']
      | components['schemas']['PlayerKickedEvent']
      | components['schemas']['PlayerBannedEvent']
      | components['schemas']['PlayerUnbannedEvent']
      | components['schemas']['ActionCompletedEvent']
      | components['schemas']['ActionFailedEvent']
      | components['schemas']['OtherEvent'];
    CollectorHeartbeatData: {
      dropped_events: number;
      gamedata: 'ok' | 'off' | 'unavailable';
      logs: 'ok' | 'off' | 'idle' | 'error';
      queue_depth: number;
      rest: 'ok' | 'down' | 'off';
      uptime_s: number;
    } & {
      [key: string]: unknown;
    };
    CollectorHeartbeatEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['CollectorHeartbeatData'];
      type: 'collector.heartbeat';
    };
    CollectorInfo: {
      arch?: string;
      name: string;
      os?: string;
      run_id: components['schemas']['Uuid'];
      version: string;
    } & {
      [key: string]: unknown;
    };
    CollectorLayers: {
      gamedata: boolean;
      logs: boolean;
      logs_source: 'launch' | 'docker' | 'file' | 'stdin' | null;
      mod: boolean;
      rest: boolean;
      saves: boolean;
    } & {
      [key: string]: unknown;
    };
    CollectorStartedData: {
      arch: string;
      collector_version: string;
      layers: components['schemas']['CollectorLayers'];
      os: string;
      server: components['schemas']['ServerInfo'] | null;
      settings: components['schemas']['ServerSettings'] | null;
    } & {
      [key: string]: unknown;
    };
    CollectorStartedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['CollectorStartedData'];
      type: 'collector.started';
    };
    Error: {
      error: {
        code:
          | 'bad_request'
          | 'unauthorized'
          | 'forbidden'
          | 'not_found'
          | 'conflict'
          | 'payload_too_large'
          | 'unprocessable'
          | 'rate_limited'
          | 'unavailable'
          | 'not_implemented';
        message: string;
      };
    };
    EventEnvelope: {
      data: Record<string, never>;
      id: components['schemas']['Uuid'];
      run_id: components['schemas']['Uuid'];
      seq: number;
      ts: string;
      type: string;
    } & {
      [key: string]: unknown;
    };
    Health: {
      db: boolean;
      mock: boolean;
      ok: boolean;
      version: string;
    };
    IngestBatch: {
      collector: components['schemas']['CollectorInfo'];
      events: components['schemas']['CollectorEvent'][];
      server: components['schemas']['ServerInfo'] | null;
    } & {
      [key: string]: unknown;
    };
    IngestResult: {
      accepted: number;
      actions: components['schemas']['CollectorAction'][];
      duplicates: number;
      invalid: number;
      last_seq: number | null;
    } & {
      [key: string]: unknown;
    };
    ModerationData: {
      by: string;
      message?: string | null;
      player_id?: components['schemas']['PlayerUid'];
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    OtherEvent: components['schemas']['EventEnvelope'] & {
      type: string;
    };
    PlayerBannedData: components['schemas']['ModerationData'];
    PlayerBannedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerBannedData'];
      type: 'player.banned';
    };
    PlayerConnectedData: {
      ip?: string | null;
      name: string;
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    PlayerConnectedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerConnectedData'];
      type: 'player.connected';
    };
    PlayerDiedData: {
      cause?: string | null;
      killer?: string | null;
      name: string;
      player_id: components['schemas']['PlayerUid'];
      source: 'snapshot' | 'mod';
      user_id: components['schemas']['UserId'];
      x: number;
      y: number;
      z?: number | null;
    } & {
      [key: string]: unknown;
    };
    PlayerDiedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerDiedData'];
      type: 'player.died';
    };
    PlayerJoinedData: {
      name: string;
      player_id: components['schemas']['PlayerUid'];
      source: 'log' | 'rest';
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    PlayerJoinedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerJoinedData'];
      type: 'player.joined';
    };
    PlayerKickedData: components['schemas']['ModerationData'];
    PlayerKickedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerKickedData'];
      type: 'player.kicked';
    };
    PlayerLeftData: {
      name: string;
      player_id: components['schemas']['PlayerUid'];
      source: 'log' | 'rest';
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    PlayerLeftEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerLeftData'];
      type: 'player.left';
    };
    PlayerLevelUpData: {
      from: number;
      name: string;
      player_id: components['schemas']['PlayerUid'];
      to: number;
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    PlayerLevelUpEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerLevelUpData'];
      type: 'player.level_up';
    };
    PlayerUid: string | null;
    PlayerUnbannedData: components['schemas']['ModerationData'];
    PlayerUnbannedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerUnbannedData'];
      type: 'player.unbanned';
    };
    ServerInfo: {
      description?: string;
      name: string;
      version: string;
      world_guid: string;
    } & {
      [key: string]: unknown;
    };
    ServerMetricsData: {
      base_camps: number;
      days: number;
      fps: number;
      fps_avg: number | null;
      frame_time_ms: number;
      max_players: number;
      players: number;
      uptime_s: number;
    } & {
      [key: string]: unknown;
    };
    ServerMetricsEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerMetricsData'];
      type: 'server.metrics';
    };
    ServerOfflineData: {
      reason: 'unreachable' | 'shutdown' | 'collector_stopping';
    } & {
      [key: string]: unknown;
    };
    ServerOfflineEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerOfflineData'];
      type: 'server.offline';
    };
    ServerOnlineData: components['schemas']['ServerInfo'];
    ServerOnlineEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['ServerOnlineData'];
      type: 'server.online';
    };
    ServerSettings: {
      base_camp_max_num_in_guild?: number;
      day_time_speed_rate: number;
      death_penalty?: string;
      exp_rate?: number;
      guild_player_max_num?: number;
      is_hardcore?: boolean;
      is_pvp?: boolean;
      night_time_speed_rate: number;
      pal_capture_rate?: number;
      server_player_max_num: number;
    } & {
      [key: string]: unknown;
    };
    Site: {
      features: components['schemas']['SiteFeatures'];
      name: string;
      version: string;
    };
    SiteFeatures: {
      chat: boolean;
      guild_chat: boolean;
      pals: boolean;
      positions: boolean;
    };
    SnapshotPal: {
      action?: string | null;
      class: string;
      guild_id?: string | null;
      hp?: number | null;
      instance_id: string;
      kind: 'party' | 'base';
      level: number;
      max_hp?: number | null;
      name?: string | null;
      owner_instance_id?: string | null;
      owner_name?: string | null;
      owner_player_id?: components['schemas']['PlayerUid'];
      x: number;
      y: number;
      z?: number | null;
    } & {
      [key: string]: unknown;
    };
    SnapshotPalBox: {
      class: string;
      guild_id: string | null;
      guild_name?: string | null;
      name?: string | null;
      x: number;
      y: number;
      z?: number | null;
    } & {
      [key: string]: unknown;
    };
    SnapshotPlayer: {
      account_name?: string | null;
      action?: string | null;
      guild_id?: string | null;
      guild_name?: string | null;
      hp?: number | null;
      instance_id?: string | null;
      level: number;
      max_hp?: number | null;
      name: string;
      ping?: number | null;
      player_id: components['schemas']['PlayerUid'];
      user_id: components['schemas']['UserId'];
      x: number;
      y: number;
      z?: number | null;
    } & {
      [key: string]: unknown;
    };
    SnapshotWild: {
      class: string;
      level: number;
      name?: string | null;
      x: number;
      y: number;
    } & {
      [key: string]: unknown;
    };
    UserId: string;
    Uuid: string;
    WorldSnapshotData: {
      in_game_day: number | null;
      in_game_time: string | null;
      palboxes: components['schemas']['SnapshotPalBox'][];
      pals: components['schemas']['SnapshotPal'][];
      players: components['schemas']['SnapshotPlayer'][];
      wild: components['schemas']['SnapshotWild'][];
    } & {
      [key: string]: unknown;
    };
    WorldSnapshotEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['WorldSnapshotData'];
      type: 'world.snapshot';
    };
  };
  responses: {
    RateLimited: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
  };
  parameters: {
    SkylarkSignature: string;
    SkylarkTimestamp: number;
  };
  requestBodies: never;
  headers: {
    CacheControl: string;
    ETag: string;
    NoStore: string;
  };
  pathItems: never;
}
export type ActionCompletedData = components['schemas']['ActionCompletedData'];
export type ActionCompletedEvent = components['schemas']['ActionCompletedEvent'];
export type ActionFailedData = components['schemas']['ActionFailedData'];
export type ActionFailedEvent = components['schemas']['ActionFailedEvent'];
export type AdminCommandData = components['schemas']['AdminCommandData'];
export type AdminCommandEvent = components['schemas']['AdminCommandEvent'];
export type ChatMessageData = components['schemas']['ChatMessageData'];
export type ChatMessageEvent = components['schemas']['ChatMessageEvent'];
export type CollectorAction = components['schemas']['CollectorAction'];
export type CollectorEvent = components['schemas']['CollectorEvent'];
export type CollectorHeartbeatData = components['schemas']['CollectorHeartbeatData'];
export type CollectorHeartbeatEvent = components['schemas']['CollectorHeartbeatEvent'];
export type CollectorInfo = components['schemas']['CollectorInfo'];
export type CollectorLayers = components['schemas']['CollectorLayers'];
export type CollectorStartedData = components['schemas']['CollectorStartedData'];
export type CollectorStartedEvent = components['schemas']['CollectorStartedEvent'];
export type Error = components['schemas']['Error'];
export type EventEnvelope = components['schemas']['EventEnvelope'];
export type Health = components['schemas']['Health'];
export type IngestBatch = components['schemas']['IngestBatch'];
export type IngestResult = components['schemas']['IngestResult'];
export type ModerationData = components['schemas']['ModerationData'];
export type OtherEvent = components['schemas']['OtherEvent'];
export type PlayerBannedData = components['schemas']['PlayerBannedData'];
export type PlayerBannedEvent = components['schemas']['PlayerBannedEvent'];
export type PlayerConnectedData = components['schemas']['PlayerConnectedData'];
export type PlayerConnectedEvent = components['schemas']['PlayerConnectedEvent'];
export type PlayerDiedData = components['schemas']['PlayerDiedData'];
export type PlayerDiedEvent = components['schemas']['PlayerDiedEvent'];
export type PlayerJoinedData = components['schemas']['PlayerJoinedData'];
export type PlayerJoinedEvent = components['schemas']['PlayerJoinedEvent'];
export type PlayerKickedData = components['schemas']['PlayerKickedData'];
export type PlayerKickedEvent = components['schemas']['PlayerKickedEvent'];
export type PlayerLeftData = components['schemas']['PlayerLeftData'];
export type PlayerLeftEvent = components['schemas']['PlayerLeftEvent'];
export type PlayerLevelUpData = components['schemas']['PlayerLevelUpData'];
export type PlayerLevelUpEvent = components['schemas']['PlayerLevelUpEvent'];
export type PlayerUid = components['schemas']['PlayerUid'];
export type PlayerUnbannedData = components['schemas']['PlayerUnbannedData'];
export type PlayerUnbannedEvent = components['schemas']['PlayerUnbannedEvent'];
export type ServerInfo = components['schemas']['ServerInfo'];
export type ServerMetricsData = components['schemas']['ServerMetricsData'];
export type ServerMetricsEvent = components['schemas']['ServerMetricsEvent'];
export type ServerOfflineData = components['schemas']['ServerOfflineData'];
export type ServerOfflineEvent = components['schemas']['ServerOfflineEvent'];
export type ServerOnlineData = components['schemas']['ServerOnlineData'];
export type ServerOnlineEvent = components['schemas']['ServerOnlineEvent'];
export type ServerSettings = components['schemas']['ServerSettings'];
export type Site = components['schemas']['Site'];
export type SiteFeatures = components['schemas']['SiteFeatures'];
export type SnapshotPal = components['schemas']['SnapshotPal'];
export type SnapshotPalBox = components['schemas']['SnapshotPalBox'];
export type SnapshotPlayer = components['schemas']['SnapshotPlayer'];
export type SnapshotWild = components['schemas']['SnapshotWild'];
export type UserId = components['schemas']['UserId'];
export type Uuid = components['schemas']['Uuid'];
export type WorldSnapshotData = components['schemas']['WorldSnapshotData'];
export type WorldSnapshotEvent = components['schemas']['WorldSnapshotEvent'];
export type ResponseRateLimited = components['responses']['RateLimited'];
export type ParameterSkylarkSignature = components['parameters']['SkylarkSignature'];
export type ParameterSkylarkTimestamp = components['parameters']['SkylarkTimestamp'];
export type HeaderCacheControl = components['headers']['CacheControl'];
export type HeaderETag = components['headers']['ETag'];
export type HeaderNoStore = components['headers']['NoStore'];
export type $defs = Record<string, never>;
export interface operations {
  ingestBatch: {
    parameters: {
      query?: never;
      header: {
        'X-Skylark-Signature': components['parameters']['SkylarkSignature'];
        'X-Skylark-Timestamp': components['parameters']['SkylarkTimestamp'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IngestBatch'];
      };
    };
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IngestResult'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      413: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Error'];
        };
      };
    };
  };
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
    };
  };
  getOpenApi: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': Record<string, never>;
        };
      };
    };
  };
  getSite: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['CacheControl'];
          ETag: components['headers']['ETag'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Site'];
        };
      };
      429: components['responses']['RateLimited'];
    };
  };
}
