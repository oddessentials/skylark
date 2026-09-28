import { getDb } from '../db/client';
import { bus } from '../events/bus';
import type { ProjectionEffects, StoredEvent } from '../ingest/context';
import { buildActivityItems, feedRowsByIds } from '../read/activity';
import { getMap } from '../read/community';
import { computeOnline, computeStatus } from '../read/status';
import { siteFeatures } from '../settings';

export const mapIntervalMs = 5_000;

let lastStatusJson: string | null = null;
let lastOnlineJson: string | null = null;
let lastMapAt = 0;
let mapTimer: ReturnType<typeof setTimeout> | null = null;

export async function publishStatus(force = false): Promise<void> {
  const db = getDb();
  const features = await siteFeatures(db);
  const [status, online] = await Promise.all([computeStatus(db), computeOnline(db, features)]);
  const statusJson = JSON.stringify({ ...status, updated_at: null });
  const onlineJson = JSON.stringify({ ...online, updated_at: null });
  if (force || statusJson !== lastStatusJson) {
    lastStatusJson = statusJson;
    bus.publish({ channel: 'status', data: status });
  }
  if (force || onlineJson !== lastOnlineJson) {
    lastOnlineJson = onlineJson;
    bus.publish({ channel: 'online', data: online });
  }
}

async function sendMap(): Promise<void> {
  mapTimer = null;
  lastMapAt = Date.now();
  if (bus.listenerCount() === 0) return;
  const db = getDb();
  bus.publish({ channel: 'map', data: await getMap(db, await siteFeatures(db)) });
}

export function publishMap(): void {
  if (mapTimer) return;
  const wait = Math.max(0, lastMapAt + mapIntervalMs - Date.now());
  mapTimer = setTimeout(() => {
    sendMap().catch((error: unknown) => console.error('map publish failed', error));
  }, wait);
}

export async function publishEvents(stored: StoredEvent[], changed: string[] = []): Promise<void> {
  if ((stored.length === 0 && changed.length === 0) || bus.listenerCount() === 0) return;
  const db = getDb();
  const features = await siteFeatures(db);
  const fresh = new Set(stored.map((event) => event.id));
  const rows = await feedRowsByIds(db, features, [...new Set([...fresh, ...changed])]);
  for (const item of await buildActivityItems(db, rows, features)) {
    bus.publish({ channel: 'activity', id: fresh.has(item.id) ? item.id : null, data: item });
  }
}

export async function publishAfterIngest(
  stored: StoredEvent[],
  effects: Pick<ProjectionEffects, 'statusChanged' | 'onlineChanged' | 'mapChanged'> &
    Partial<Pick<ProjectionEffects, 'changedEvents'>>
): Promise<void> {
  try {
    await publishEvents(stored, effects.changedEvents ?? []);
    if (effects.statusChanged || effects.onlineChanged) await publishStatus();
    if (effects.mapChanged) publishMap();
  } catch (error) {
    console.error('stream publish failed', error);
  }
}
