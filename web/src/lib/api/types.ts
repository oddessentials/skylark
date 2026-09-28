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
  '/api/v1/activity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listActivity'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/actions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listActions'];
    put?: never;
    post: operations['createAction'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/actions/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['cancelAction'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/backups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listBackups'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/backups/run': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['runBackup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/collector': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminCollector'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/collector/secret': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['regenerateCollectorSecret'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAdminEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/jobs/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getJob'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['adminLogin'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['adminLogout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/players': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAdminPlayers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/players/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations['updateAdminPlayer'];
    trace?: never;
  };
  '/api/v1/admin/projections/rebuild': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['rebuildProjections'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/session': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminSession'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminSettings'];
    put: operations['updateAdminSettings'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/setup': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['adminSetup'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/chat': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listChat'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/guilds': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listGuilds'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/guilds/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getGuild'];
    put?: never;
    post?: never;
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
  '/api/v1/leaderboards': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getLeaderboards'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/map': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getMap'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/online': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOnline'];
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
  '/api/v1/players': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listPlayers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/players/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getPlayer'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/players/{id}/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listPlayerSessions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/players/{id}/trail': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getPlayerTrail'];
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
  '/api/v1/status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getStatus'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/status/history': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getStatusHistory'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/stream': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['streamEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/world': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getWorld'];
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
    Action: {
      created_at: string;
      delivered_at: string | null;
      error: string | null;
      finished_at: string | null;
      id: number;
      kind: components['schemas']['ActionKind'];
      message: string | null;
      not_before: string | null;
      player: components['schemas']['PlayerRef'] | null;
      state: components['schemas']['ActionState'];
      user_id: components['schemas']['UserId'] | null;
      waittime_s: number | null;
    };
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
    ActionCreate: {
      delay_s?: number;
      kind: components['schemas']['ActionKind'];
      message?: string;
      player_id?: number;
      user_id?: components['schemas']['UserId'];
      waittime_s?: number;
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
    ActionKind: 'announce' | 'kick' | 'ban' | 'unban' | 'save' | 'shutdown';
    ActionList: {
      items: components['schemas']['Action'][];
    };
    ActionState: 'queued' | 'sent' | 'done' | 'failed' | 'expired' | 'cancelled';
    ActivityDetails: {
      base_id?: number;
      base_name?: string | null;
      cause?: string | null;
      channel?: components['schemas']['ChatChannel'];
      from?: number;
      guild?: components['schemas']['GuildRef'] | null;
      killer?: string | null;
      last_seen_at?: string;
      new_name?: string;
      old_name?: string;
      previous_guild?: components['schemas']['GuildRef'] | null;
      reason?: string;
      region?: string | null;
      session_s?: number | null;
      text?: string;
      to?: number;
      version?: string | null;
      x?: number;
      y?: number;
    };
    ActivityItem: {
      details: components['schemas']['ActivityDetails'];
      id: components['schemas']['Uuid'];
      player: components['schemas']['PlayerRef'] | null;
      ts: string;
      type: components['schemas']['ActivityType'];
    };
    ActivityPage: {
      items: components['schemas']['ActivityItem'][];
      next_cursor: string | null;
    };
    ActivityType:
      | 'server.online'
      | 'server.offline'
      | 'collector.lost'
      | 'player.joined'
      | 'player.left'
      | 'player.level_up'
      | 'player.died'
      | 'chat.message'
      | 'base.established'
      | 'base.removed'
      | 'guild.renamed'
      | 'player.guild_joined';
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
    AdminEvent: {
      data: {
        [key: string]: unknown;
      };
      id: components['schemas']['Uuid'];
      invalid: string | null;
      player: components['schemas']['PlayerRef'] | null;
      quiet: boolean;
      received_at: string;
      run_id: components['schemas']['Uuid'];
      seq: number;
      source: 'collector' | 'site';
      ts: string;
      type: string;
    };
    AdminHealth: {
      backup: components['schemas']['AdminHealthBackup'];
      collector: components['schemas']['AdminHealthCollector'];
      db: components['schemas']['AdminHealthDb'];
      ingest: components['schemas']['IngestCounters'];
      jobs: components['schemas']['AdminHealthJob'][];
    };
    AdminHealthBackup: {
      kept: number;
      last_at: string | null;
      size_mb: number | null;
    };
    AdminHealthCollector: {
      dropped_events: number | null;
      gamedata: string | null;
      heartbeat_age_s: number | null;
      logs: string | null;
      queue_depth: number | null;
      rest: string | null;
      run: components['schemas']['CollectorRun'] | null;
      state: 'active' | 'stopped' | 'lost' | 'none';
    };
    AdminHealthDb: {
      events_total: number;
      positions_total: number;
      size_mb: number;
    };
    AdminHealthJob: {
      last_error: string | null;
      last_ok: boolean | null;
      last_run_at: string | null;
      name: string;
    };
    AdminPlayer: {
      account_name: string | null;
      first_seen: string;
      game_name: string;
      hidden: boolean;
      id: number;
      last_seen: string;
      level: number;
      name: string;
      name_override: string | null;
      online: boolean;
      platform: components['schemas']['Platform'];
      player_uid: string | null;
      playtime_s: number;
      sessions: number;
      user_id: components['schemas']['UserId'];
    };
    AdminPlayerPage: {
      items: components['schemas']['AdminPlayer'][];
      next_cursor: string | null;
    };
    AdminSession: {
      authenticated: boolean;
      expires_at: string | null;
      setup_required: boolean;
    };
    AdminSettings: {
      features: components['schemas']['SiteFeatures'];
      locked: 'site_name'[];
      retention: components['schemas']['Retention'];
      site_name: string;
    };
    AdminSettingsUpdate: {
      features?: {
        bases?: boolean;
        chat?: boolean;
        guild_chat?: boolean;
        pals?: boolean;
        positions?: boolean;
      };
      retention?: {
        metrics_days?: number;
        positions_days?: number | null;
        snapshots_hours?: number;
        status_samples_days?: number;
      };
      site_name?: string;
    };
    Backup: {
      at: string;
      file: string;
      ok: boolean;
      size_bytes: number;
    };
    BackupList: {
      items: components['schemas']['Backup'][];
    };
    Base: {
      first_seen: string;
      gone_at: string | null;
      guild: components['schemas']['GuildRef'] | null;
      id: number;
      last_seen: string;
      name: string | null;
      region: string | null;
      workers: number;
      workers_seen_at: string | null;
      x: number;
      y: number;
    };
    ChatChannel: 'global' | 'guild' | 'say' | 'other';
    ChatItem: {
      channel: components['schemas']['ChatChannel'];
      id: components['schemas']['Uuid'];
      player: components['schemas']['PlayerRef'] | null;
      text: string;
      ts: string;
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
    ChatPage: {
      items: components['schemas']['ChatItem'][];
      next_cursor: string | null;
    };
    CollectorAction: {
      id: number;
      kind: 'announce' | 'kick' | 'ban' | 'unban' | 'save' | 'shutdown';
      message: string | null;
      user_id: components['schemas']['UserId'] | null;
      waittime_s: number | null;
    };
    CollectorAdmin: {
      ingest: components['schemas']['IngestCounters'];
      runs: components['schemas']['CollectorRun'][];
      secret: string;
      secret_from_environment: boolean;
      site_version: string;
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
    CollectorLayersSummary: {
      gamedata: boolean;
      logs: boolean;
      mod: boolean;
      rest: boolean;
      saves: boolean;
    };
    CollectorRun: {
      arch: string | null;
      heartbeat: {
        [key: string]: unknown;
      } | null;
      heartbeat_at: string | null;
      last_seen_at: string;
      last_seq: number;
      layers: {
        [key: string]: unknown;
      } | null;
      lost_at: string | null;
      name: string | null;
      os: string | null;
      run_id: components['schemas']['Uuid'];
      server_version: string | null;
      started_at: string;
      stopped_at: string | null;
      version: string | null;
      world_guid: string | null;
    };
    CollectorSecret: {
      secret: string;
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
    CurrentSession: {
      id: number;
      joined_at: string;
    };
    Death: {
      at: string;
      cause: string | null;
      killer: string | null;
      x: number | null;
      y: number | null;
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
    EventPage: {
      items: components['schemas']['AdminEvent'][];
      next_cursor: string | null;
    };
    Guild: {
      bases: components['schemas']['Base'][];
      first_seen: string;
      id: string;
      last_seen: string;
      members: components['schemas']['GuildMember'][];
      name: string;
    };
    GuildList: {
      items: components['schemas']['GuildSummary'][];
    };
    GuildMember: {
      last_seen: string;
      level: number;
      online: boolean;
      player: components['schemas']['PlayerRef'];
      since: string;
    };
    GuildRef: {
      id: string;
      name: string;
    };
    GuildSummary: {
      bases: number | null;
      first_seen: string;
      id: string;
      last_seen: string;
      members: number;
      name: string;
      online: number;
      top_level: number | null;
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
    IngestCounters: {
      batches_24h: number;
      duplicates_24h: number;
      events_24h: number;
      invalid_24h: number;
      last_batch_at: string | null;
      rejected_24h: number;
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
    Job: {
      error: string | null;
      finished_at: string | null;
      id: number;
      kind: 'projections_rebuild' | 'backup';
      progress: number | null;
      started_at: string | null;
      state: 'queued' | 'running' | 'done' | 'failed';
    };
    JobAccepted: {
      job_id: number;
    };
    LeaderboardEntry: {
      player: components['schemas']['PlayerRef'];
      value: number;
    };
    Leaderboards: {
      chat: components['schemas']['LeaderboardEntry'][];
      deaths: components['schemas']['LeaderboardEntry'][];
      distance: components['schemas']['LeaderboardEntry'][];
      level: components['schemas']['LeaderboardEntry'][];
      playtime: components['schemas']['LeaderboardEntry'][];
      playtime_week: components['schemas']['LeaderboardEntry'][];
    };
    LevelPoint: {
      at: string;
      level: number;
    };
    LoginRequest: {
      password: string;
    };
    MapDeath: {
      at: string;
      player: components['schemas']['PlayerRef'];
      x: number;
      y: number;
    };
    MapPlayer: {
      down: boolean;
      guild_id: string | null;
      id: number;
      level: number;
      name: string;
      x: number;
      y: number;
    };
    MapState: {
      bases: components['schemas']['Base'][];
      deaths: components['schemas']['MapDeath'][];
      players: components['schemas']['MapPlayer'][];
      updated_at: string | null;
      wild: components['schemas']['MapWild'][];
    };
    MapWild: {
      level: number;
      name: string | null;
      species: string;
      x: number;
      y: number;
    };
    ModerationData: {
      by: string;
      message?: string | null;
      player_id?: components['schemas']['PlayerUid'];
      user_id: components['schemas']['UserId'];
    } & {
      [key: string]: unknown;
    };
    OnlineList: {
      players: components['schemas']['OnlinePlayer'][];
      updated_at: string;
    };
    OnlinePlayer: {
      down: boolean;
      guild: components['schemas']['GuildRef'] | null;
      hp: number | null;
      id: number;
      joined_at: string;
      level: number;
      max_hp: number | null;
      name: string;
      party: components['schemas']['PartyPal'][];
      platform: components['schemas']['Platform'];
      position: components['schemas']['Point'] | null;
    };
    OtherEvent: components['schemas']['EventEnvelope'] & {
      type: string;
    };
    PartyPal: {
      level: number;
      name: string | null;
      species: string;
    };
    Platform: 'steam' | 'gdk' | 'ps5' | 'mac' | 'other';
    Player: {
      chat_messages: number | null;
      current_session: components['schemas']['CurrentSession'] | null;
      deaths: number;
      distance_m: number | null;
      first_seen: string;
      guild: components['schemas']['GuildRef'] | null;
      id: number;
      last_seen: string;
      level: number;
      level_history: components['schemas']['LevelPoint'][];
      name: string;
      online: boolean;
      party: components['schemas']['PartyPal'][];
      platform: components['schemas']['Platform'];
      playtime_s: number;
      position: components['schemas']['PlayerPosition'] | null;
      recent_deaths: components['schemas']['Death'][];
      recent_sessions: components['schemas']['Session'][];
      sessions: number;
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
    PlayerPage: {
      items: components['schemas']['PlayerSummary'][];
      next_cursor: string | null;
    };
    PlayerPatch: {
      hidden?: boolean;
      name_override?: string | null;
    };
    PlayerPosition: {
      at: string;
      x: number;
      y: number;
    };
    PlayerRef: {
      id: number;
      name: string;
    };
    PlayerSummary: {
      deaths: number;
      first_seen: string;
      guild: components['schemas']['GuildRef'] | null;
      id: number;
      last_seen: string;
      level: number;
      name: string;
      online: boolean;
      platform: components['schemas']['Platform'];
      playtime_s: number;
      sessions: number;
    };
    PlayerUid: string | null;
    PlayerUnbannedData: components['schemas']['ModerationData'];
    PlayerUnbannedEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['PlayerUnbannedData'];
      type: 'player.unbanned';
    };
    Point: {
      x: number;
      y: number;
    };
    Retention: {
      metrics_days: number;
      positions_days: number | null;
      snapshots_hours: number;
      status_samples_days: number;
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
    ServerOnlineData: components['schemas']['ServerInfo'] & {
      settings?: components['schemas']['ServerSettings'] | null;
    };
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
    Session: {
      deaths: number;
      distance_m: number | null;
      duration_s: number | null;
      end_reason: components['schemas']['SessionEndReason'] | null;
      id: number;
      joined_at: string;
      left_at: string | null;
      level_end: number | null;
      level_start: number | null;
    };
    SessionEndReason: 'left' | 'server_offline' | 'collector_stopped' | 'collector_lost' | 'absent';
    SessionPage: {
      items: components['schemas']['Session'][];
      next_cursor: string | null;
    };
    SetupRequest: {
      password: string;
    };
    Site: {
      features: components['schemas']['SiteFeatures'];
      name: string;
      version: string;
    };
    SiteFeatures: {
      bases: boolean;
      chat: boolean;
      guild_chat: boolean;
      pals: boolean;
      positions: boolean;
    };
    SnapshotPal: {
      action?: string | null;
      ai_action?: string | null;
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
    Status: {
      clock: components['schemas']['WorldClock'];
      collector: components['schemas']['StatusCollector'];
      performance: components['schemas']['StatusPerformance'];
      players: components['schemas']['StatusPlayers'];
      server: components['schemas']['StatusServer'];
      since: string | null;
      state: components['schemas']['StatusState'];
      updated_at: string;
    };
    StatusCollector: {
      last_seen_at: string | null;
      layers: components['schemas']['CollectorLayersSummary'] | null;
      state: 'active' | 'stopped' | 'lost' | 'none';
      version: string | null;
    };
    StatusHistory: {
      bucket_s: number;
      points: components['schemas']['StatusHistoryPoint'][];
      range: '24h' | '7d' | '30d';
    };
    StatusHistoryPoint: {
      fps_avg: number | null;
      players_avg: number;
      players_max: number;
      state: components['schemas']['StatusState'];
      ts: string;
    };
    StatusPerformance: {
      fps: number | null;
      fps_avg: number | null;
      frame_time_ms: number | null;
      measured_at: string | null;
      uptime_s: number | null;
    };
    StatusPlayers: {
      max: number | null;
      online: number;
    };
    StatusServer: {
      description: string | null;
      name: string | null;
      version: string | null;
    };
    StatusState: 'online' | 'offline' | 'unknown';
    StreamFrame: {
      data:
        | components['schemas']['Status']
        | components['schemas']['OnlineList']
        | components['schemas']['MapState']
        | components['schemas']['ActivityItem'];
      event: 'status' | 'online' | 'map' | 'activity';
      id: string | null;
    };
    Trail: {
      points: components['schemas']['TrailPoint'][];
      session_id: number | null;
    };
    TrailPoint: {
      at: string;
      x: number;
      y: number;
    };
    UserId: string;
    Uuid: string;
    World: {
      clock: components['schemas']['WorldClock'];
      description: string | null;
      name: string | null;
      settings: components['schemas']['WorldSettings'];
      totals: components['schemas']['WorldTotals'];
      tracking_since: string | null;
      version: string | null;
    };
    WorldClock: {
      day: number | null;
      day_speed: number | null;
      night_speed: number | null;
      observed_at: string | null;
      time: string | null;
    };
    WorldSettings: {
      base_camp_max_num_in_guild: number | null;
      day_time_speed_rate: number | null;
      death_penalty: string | null;
      exp_rate: number | null;
      guild_player_max_num: number | null;
      is_hardcore: boolean | null;
      is_pvp: boolean | null;
      max_players: number | null;
      night_time_speed_rate: number | null;
      pal_capture_rate: number | null;
    };
    WorldSnapshotData: {
      in_game_day: number | null;
      in_game_time: string | null;
      palboxes: components['schemas']['SnapshotPalBox'][];
      pals: components['schemas']['SnapshotPal'][];
      pals_omitted?: number;
      players: components['schemas']['SnapshotPlayer'][];
      source: 'gamedata' | 'rest';
      wild: components['schemas']['SnapshotWild'][];
      wild_omitted?: number;
    } & {
      [key: string]: unknown;
    };
    WorldSnapshotEvent: components['schemas']['EventEnvelope'] & {
      data: components['schemas']['WorldSnapshotData'];
      type: 'world.snapshot';
    };
    WorldTotals: {
      bases: number | null;
      deaths: number;
      guilds: number;
      level_ups: number;
      players: number;
      playtime_s: number;
      sessions: number;
    };
  };
  responses: {
    BadRequest: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Conflict: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Forbidden: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    NotFound: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    RateLimited: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Unauthorized: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
    Unavailable: {
      headers: {
        [name: string]: unknown;
      };
      content: {
        'application/json': components['schemas']['Error'];
      };
    };
  };
  parameters: {
    ActionId: number;
    Cursor: string;
    GuildId: string;
    JobId: number;
    LastEventId: string;
    Limit: number;
    PlayerFilter: number;
    PlayerId: number;
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
export type Action = components['schemas']['Action'];
export type ActionCompletedData = components['schemas']['ActionCompletedData'];
export type ActionCompletedEvent = components['schemas']['ActionCompletedEvent'];
export type ActionCreate = components['schemas']['ActionCreate'];
export type ActionFailedData = components['schemas']['ActionFailedData'];
export type ActionFailedEvent = components['schemas']['ActionFailedEvent'];
export type ActionKind = components['schemas']['ActionKind'];
export type ActionList = components['schemas']['ActionList'];
export type ActionState = components['schemas']['ActionState'];
export type ActivityDetails = components['schemas']['ActivityDetails'];
export type ActivityItem = components['schemas']['ActivityItem'];
export type ActivityPage = components['schemas']['ActivityPage'];
export type ActivityType = components['schemas']['ActivityType'];
export type AdminCommandData = components['schemas']['AdminCommandData'];
export type AdminCommandEvent = components['schemas']['AdminCommandEvent'];
export type AdminEvent = components['schemas']['AdminEvent'];
export type AdminHealth = components['schemas']['AdminHealth'];
export type AdminHealthBackup = components['schemas']['AdminHealthBackup'];
export type AdminHealthCollector = components['schemas']['AdminHealthCollector'];
export type AdminHealthDb = components['schemas']['AdminHealthDb'];
export type AdminHealthJob = components['schemas']['AdminHealthJob'];
export type AdminPlayer = components['schemas']['AdminPlayer'];
export type AdminPlayerPage = components['schemas']['AdminPlayerPage'];
export type AdminSession = components['schemas']['AdminSession'];
export type AdminSettings = components['schemas']['AdminSettings'];
export type AdminSettingsUpdate = components['schemas']['AdminSettingsUpdate'];
export type Backup = components['schemas']['Backup'];
export type BackupList = components['schemas']['BackupList'];
export type Base = components['schemas']['Base'];
export type ChatChannel = components['schemas']['ChatChannel'];
export type ChatItem = components['schemas']['ChatItem'];
export type ChatMessageData = components['schemas']['ChatMessageData'];
export type ChatMessageEvent = components['schemas']['ChatMessageEvent'];
export type ChatPage = components['schemas']['ChatPage'];
export type CollectorAction = components['schemas']['CollectorAction'];
export type CollectorAdmin = components['schemas']['CollectorAdmin'];
export type CollectorEvent = components['schemas']['CollectorEvent'];
export type CollectorHeartbeatData = components['schemas']['CollectorHeartbeatData'];
export type CollectorHeartbeatEvent = components['schemas']['CollectorHeartbeatEvent'];
export type CollectorInfo = components['schemas']['CollectorInfo'];
export type CollectorLayers = components['schemas']['CollectorLayers'];
export type CollectorLayersSummary = components['schemas']['CollectorLayersSummary'];
export type CollectorRun = components['schemas']['CollectorRun'];
export type CollectorSecret = components['schemas']['CollectorSecret'];
export type CollectorStartedData = components['schemas']['CollectorStartedData'];
export type CollectorStartedEvent = components['schemas']['CollectorStartedEvent'];
export type CurrentSession = components['schemas']['CurrentSession'];
export type Death = components['schemas']['Death'];
export type Error = components['schemas']['Error'];
export type EventEnvelope = components['schemas']['EventEnvelope'];
export type EventPage = components['schemas']['EventPage'];
export type Guild = components['schemas']['Guild'];
export type GuildList = components['schemas']['GuildList'];
export type GuildMember = components['schemas']['GuildMember'];
export type GuildRef = components['schemas']['GuildRef'];
export type GuildSummary = components['schemas']['GuildSummary'];
export type Health = components['schemas']['Health'];
export type IngestBatch = components['schemas']['IngestBatch'];
export type IngestCounters = components['schemas']['IngestCounters'];
export type IngestResult = components['schemas']['IngestResult'];
export type Job = components['schemas']['Job'];
export type JobAccepted = components['schemas']['JobAccepted'];
export type LeaderboardEntry = components['schemas']['LeaderboardEntry'];
export type Leaderboards = components['schemas']['Leaderboards'];
export type LevelPoint = components['schemas']['LevelPoint'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type MapDeath = components['schemas']['MapDeath'];
export type MapPlayer = components['schemas']['MapPlayer'];
export type MapState = components['schemas']['MapState'];
export type MapWild = components['schemas']['MapWild'];
export type ModerationData = components['schemas']['ModerationData'];
export type OnlineList = components['schemas']['OnlineList'];
export type OnlinePlayer = components['schemas']['OnlinePlayer'];
export type OtherEvent = components['schemas']['OtherEvent'];
export type PartyPal = components['schemas']['PartyPal'];
export type Platform = components['schemas']['Platform'];
export type Player = components['schemas']['Player'];
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
export type PlayerPage = components['schemas']['PlayerPage'];
export type PlayerPatch = components['schemas']['PlayerPatch'];
export type PlayerPosition = components['schemas']['PlayerPosition'];
export type PlayerRef = components['schemas']['PlayerRef'];
export type PlayerSummary = components['schemas']['PlayerSummary'];
export type PlayerUid = components['schemas']['PlayerUid'];
export type PlayerUnbannedData = components['schemas']['PlayerUnbannedData'];
export type PlayerUnbannedEvent = components['schemas']['PlayerUnbannedEvent'];
export type Point = components['schemas']['Point'];
export type Retention = components['schemas']['Retention'];
export type ServerInfo = components['schemas']['ServerInfo'];
export type ServerMetricsData = components['schemas']['ServerMetricsData'];
export type ServerMetricsEvent = components['schemas']['ServerMetricsEvent'];
export type ServerOfflineData = components['schemas']['ServerOfflineData'];
export type ServerOfflineEvent = components['schemas']['ServerOfflineEvent'];
export type ServerOnlineData = components['schemas']['ServerOnlineData'];
export type ServerOnlineEvent = components['schemas']['ServerOnlineEvent'];
export type ServerSettings = components['schemas']['ServerSettings'];
export type Session = components['schemas']['Session'];
export type SessionEndReason = components['schemas']['SessionEndReason'];
export type SessionPage = components['schemas']['SessionPage'];
export type SetupRequest = components['schemas']['SetupRequest'];
export type Site = components['schemas']['Site'];
export type SiteFeatures = components['schemas']['SiteFeatures'];
export type SnapshotPal = components['schemas']['SnapshotPal'];
export type SnapshotPalBox = components['schemas']['SnapshotPalBox'];
export type SnapshotPlayer = components['schemas']['SnapshotPlayer'];
export type SnapshotWild = components['schemas']['SnapshotWild'];
export type Status = components['schemas']['Status'];
export type StatusCollector = components['schemas']['StatusCollector'];
export type StatusHistory = components['schemas']['StatusHistory'];
export type StatusHistoryPoint = components['schemas']['StatusHistoryPoint'];
export type StatusPerformance = components['schemas']['StatusPerformance'];
export type StatusPlayers = components['schemas']['StatusPlayers'];
export type StatusServer = components['schemas']['StatusServer'];
export type StatusState = components['schemas']['StatusState'];
export type StreamFrame = components['schemas']['StreamFrame'];
export type Trail = components['schemas']['Trail'];
export type TrailPoint = components['schemas']['TrailPoint'];
export type UserId = components['schemas']['UserId'];
export type Uuid = components['schemas']['Uuid'];
export type World = components['schemas']['World'];
export type WorldClock = components['schemas']['WorldClock'];
export type WorldSettings = components['schemas']['WorldSettings'];
export type WorldSnapshotData = components['schemas']['WorldSnapshotData'];
export type WorldSnapshotEvent = components['schemas']['WorldSnapshotEvent'];
export type WorldTotals = components['schemas']['WorldTotals'];
export type ResponseBadRequest = components['responses']['BadRequest'];
export type ResponseConflict = components['responses']['Conflict'];
export type ResponseForbidden = components['responses']['Forbidden'];
export type ResponseNotFound = components['responses']['NotFound'];
export type ResponseRateLimited = components['responses']['RateLimited'];
export type ResponseUnauthorized = components['responses']['Unauthorized'];
export type ResponseUnavailable = components['responses']['Unavailable'];
export type ParameterActionId = components['parameters']['ActionId'];
export type ParameterCursor = components['parameters']['Cursor'];
export type ParameterGuildId = components['parameters']['GuildId'];
export type ParameterJobId = components['parameters']['JobId'];
export type ParameterLastEventId = components['parameters']['LastEventId'];
export type ParameterLimit = components['parameters']['Limit'];
export type ParameterPlayerFilter = components['parameters']['PlayerFilter'];
export type ParameterPlayerId = components['parameters']['PlayerId'];
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
  listActivity: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        player?: components['parameters']['PlayerFilter'];
        types?: string;
      };
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
          'application/json': components['schemas']['ActivityPage'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  listActions: {
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
          'application/json': components['schemas']['ActionList'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  createAction: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ActionCreate'];
      };
    };
    responses: {
      201: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Action'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      503: components['responses']['Unavailable'];
    };
  };
  cancelAction: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['ActionId'];
      };
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
          'application/json': components['schemas']['Action'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  listBackups: {
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
          'application/json': components['schemas']['BackupList'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  runBackup: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobAccepted'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  getAdminCollector: {
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
          'application/json': components['schemas']['CollectorAdmin'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  regenerateCollectorSecret: {
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
          'application/json': components['schemas']['CollectorSecret'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  listAdminEvents: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        invalid?: boolean;
        limit?: components['parameters']['Limit'];
        player?: components['parameters']['PlayerFilter'];
        type?: string;
      };
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
          'application/json': components['schemas']['EventPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  getAdminHealth: {
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
          'application/json': components['schemas']['AdminHealth'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  getJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['JobId'];
      };
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
          'application/json': components['schemas']['Job'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      404: components['responses']['NotFound'];
      503: components['responses']['Unavailable'];
    };
  };
  adminLogin: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LoginRequest'];
      };
    };
    responses: {
      204: {
        headers: {
          'Set-Cookie'?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  adminLogout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      403: components['responses']['Forbidden'];
    };
  };
  listAdminPlayers: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        q?: string;
      };
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
          'application/json': components['schemas']['AdminPlayerPage'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  updateAdminPlayer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['PlayerId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PlayerPatch'];
      };
    };
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminPlayer'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      404: components['responses']['NotFound'];
      503: components['responses']['Unavailable'];
    };
  };
  rebuildProjections: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobAccepted'];
        };
      };
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  getAdminSession: {
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
          'application/json': components['schemas']['AdminSession'];
        };
      };
      503: components['responses']['Unavailable'];
    };
  };
  getAdminSettings: {
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
          'application/json': components['schemas']['AdminSettings'];
        };
      };
      401: components['responses']['Unauthorized'];
      503: components['responses']['Unavailable'];
    };
  };
  updateAdminSettings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AdminSettingsUpdate'];
      };
    };
    responses: {
      200: {
        headers: {
          'Cache-Control': components['headers']['NoStore'];
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminSettings'];
        };
      };
      400: components['responses']['BadRequest'];
      401: components['responses']['Unauthorized'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      503: components['responses']['Unavailable'];
    };
  };
  adminSetup: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetupRequest'];
      };
    };
    responses: {
      204: {
        headers: {
          'Set-Cookie'?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['BadRequest'];
      403: components['responses']['Forbidden'];
      409: components['responses']['Conflict'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  listChat: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
      };
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
          'application/json': components['schemas']['ChatPage'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  listGuilds: {
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
          'application/json': components['schemas']['GuildList'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getGuild: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['GuildId'];
      };
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
          'application/json': components['schemas']['Guild'];
        };
      };
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
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
  getLeaderboards: {
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
          'application/json': components['schemas']['Leaderboards'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getMap: {
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
          'application/json': components['schemas']['MapState'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getOnline: {
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
          'application/json': components['schemas']['OnlineList'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
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
  listPlayers: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        q?: string;
        sort?: 'last_seen' | 'playtime' | 'level' | 'name';
      };
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
          'application/json': components['schemas']['PlayerPage'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getPlayer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: components['parameters']['PlayerId'];
      };
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
          'application/json': components['schemas']['Player'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  listPlayerSessions: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        id: components['parameters']['PlayerId'];
      };
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
          'application/json': components['schemas']['SessionPage'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getPlayerTrail: {
    parameters: {
      query?: {
        session?: number;
      };
      header?: never;
      path: {
        id: components['parameters']['PlayerId'];
      };
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
          'application/json': components['schemas']['Trail'];
        };
      };
      400: components['responses']['BadRequest'];
      404: components['responses']['NotFound'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
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
  getStatus: {
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
          'application/json': components['schemas']['Status'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  getStatusHistory: {
    parameters: {
      query?: {
        range?: '24h' | '7d' | '30d';
      };
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
          'application/json': components['schemas']['StatusHistory'];
        };
      };
      400: components['responses']['BadRequest'];
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
  streamEvents: {
    parameters: {
      query?: {
        last_event_id?: string;
      };
      header?: {
        'Last-Event-ID'?: components['parameters']['LastEventId'];
      };
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
          'text/event-stream': components['schemas']['StreamFrame'];
        };
      };
      503: components['responses']['Unavailable'];
    };
  };
  getWorld: {
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
          'application/json': components['schemas']['World'];
        };
      };
      429: components['responses']['RateLimited'];
      503: components['responses']['Unavailable'];
    };
  };
}
