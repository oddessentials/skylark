import { endpoints } from './endpoints';
import type { ActivityItem, MapState, OnlineList, Status } from './types';

export type StreamState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface StreamHandlers {
  onStatus?: (status: Status) => void;
  onOnline?: (online: OnlineList) => void;
  onMap?: (map: MapState) => void;
  onActivity?: (item: ActivityItem) => void;
  onState?: (state: StreamState) => void;
}

export interface StreamOptions {
  url?: string;
  lastEventId?: string | null;
  minRetryMs?: number;
  maxRetryMs?: number;
  eventSource?: typeof EventSource;
}

export interface StreamConnection {
  readonly state: StreamState;
  readonly lastEventId: string | null;
  close(): void;
}

export function connectStream(
  handlers: StreamHandlers,
  options: StreamOptions = {}
): StreamConnection {
  const EventSourceImpl = options.eventSource ?? globalThis.EventSource;
  if (!EventSourceImpl) throw new Error('EventSource is not available in this environment');
  const baseUrl = options.url ?? endpoints.stream;
  const minRetry = options.minRetryMs ?? 1000;
  const maxRetry = options.maxRetryMs ?? 30_000;

  let state: StreamState = 'connecting';
  let lastEventId: string | null = options.lastEventId ?? null;
  let source: EventSource | null = null;
  let retryMs = minRetry;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const setState = (next: StreamState) => {
    if (state === next) return;
    state = next;
    handlers.onState?.(next);
  };

  const parse = <T>(event: Event): T | null => {
    try {
      return JSON.parse((event as MessageEvent<string>).data) as T;
    } catch {
      return null;
    }
  };

  const open = () => {
    if (closed) return;
    const url = new URL(baseUrl, globalThis.location?.href ?? 'http://localhost');
    if (lastEventId) url.searchParams.set('last_event_id', lastEventId);
    const target =
      url.origin === 'http://localhost' && !globalThis.location
        ? url.pathname + url.search
        : url.href;
    const next = new EventSourceImpl(target);
    source = next;

    next.addEventListener('open', () => {
      retryMs = minRetry;
      setState('open');
    });
    next.addEventListener('status', (event) => {
      const data = parse<Status>(event);
      if (data) handlers.onStatus?.(data);
    });
    next.addEventListener('online', (event) => {
      const data = parse<OnlineList>(event);
      if (data) handlers.onOnline?.(data);
    });
    next.addEventListener('map', (event) => {
      const data = parse<MapState>(event);
      if (data) handlers.onMap?.(data);
    });
    next.addEventListener('activity', (event) => {
      const data = parse<ActivityItem>(event);
      if (!data) return;
      const id = (event as MessageEvent<string>).lastEventId;
      if (id) lastEventId = id;
      handlers.onActivity?.(data);
    });
    next.addEventListener('error', () => {
      if (closed) return;
      if (next.readyState === EventSourceImpl.CLOSED) {
        next.close();
        setState('reconnecting');
        retryTimer = setTimeout(open, retryMs);
        retryMs = Math.min(retryMs * 2, maxRetry);
      } else {
        setState('reconnecting');
      }
    });
  };

  open();

  return {
    get state() {
      return state;
    },
    get lastEventId() {
      return lastEventId;
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
      setState('closed');
    }
  };
}
