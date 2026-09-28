export const API_BASE = '/api/v1';
export const INGEST_BASE = '/api/ingest';

export const endpoints = {
  status: `${API_BASE}/status`,
  statusHistory: `${API_BASE}/status/history`,
  online: `${API_BASE}/online`,
  activity: `${API_BASE}/activity`,
  players: `${API_BASE}/players`,
  player: `${API_BASE}/players/{id}`,
  playerSessions: `${API_BASE}/players/{id}/sessions`,
  playerTrail: `${API_BASE}/players/{id}/trail`,
  playerPalpedia: `${API_BASE}/players/{id}/palpedia`,
  chat: `${API_BASE}/chat`,
  guilds: `${API_BASE}/guilds`,
  guild: `${API_BASE}/guilds/{id}`,
  guildPalpedia: `${API_BASE}/guilds/{id}/palpedia`,
  guildPals: `${API_BASE}/guilds/{id}/pals`,
  map: `${API_BASE}/map`,
  leaderboards: `${API_BASE}/leaderboards`,
  world: `${API_BASE}/world`,
  stream: `${API_BASE}/stream`,
  health: `${API_BASE}/health`,
  site: `${API_BASE}/site`,
  openapi: `${API_BASE}/openapi.json`,
  adminLogin: `${API_BASE}/admin/login`,
  adminLogout: `${API_BASE}/admin/logout`,
  adminSession: `${API_BASE}/admin/session`,
  adminSetup: `${API_BASE}/admin/setup`,
  adminSettings: `${API_BASE}/admin/settings`,
  adminCollector: `${API_BASE}/admin/collector`,
  adminCollectorSecret: `${API_BASE}/admin/collector/secret`,
  adminPlayers: `${API_BASE}/admin/players`,
  adminPlayer: `${API_BASE}/admin/players/{id}`,
  adminActions: `${API_BASE}/admin/actions`,
  adminAction: `${API_BASE}/admin/actions/{id}`,
  adminEvents: `${API_BASE}/admin/events`,
  adminProjectionsRebuild: `${API_BASE}/admin/projections/rebuild`,
  adminBackups: `${API_BASE}/admin/backups`,
  adminBackupsRun: `${API_BASE}/admin/backups/run`,
  adminJob: `${API_BASE}/admin/jobs/{id}`,
  adminHealth: `${API_BASE}/admin/health`,
  ingest: INGEST_BASE
} as const;

export type EndpointName = keyof typeof endpoints;

export function resolvePath(
  template: string,
  params: Record<string, string | number> = {}
): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing path parameter ${name} for ${template}`);
    return encodeURIComponent(String(value));
  });
}
