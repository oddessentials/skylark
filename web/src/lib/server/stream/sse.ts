import type { StreamFrame } from '$lib/api/types';
import { getDb } from '../db/client';
import { bus, type BusEvent } from '../events/bus';
import { buildActivityItems, feedRowsAfter } from '../read/activity';
import { getMap } from '../read/community';
import { computeOnline, computeStatus } from '../read/status';
import { serializeFrame } from '../mock/sse';
import { siteFeatures } from '../settings';

export const keepAliveMs = 15_000;
export const replayLimit = 100;

function frameOf(event: BusEvent): StreamFrame {
  if (event.channel === 'activity') return { event: 'activity', id: event.id, data: event.data };
  return { event: event.channel, id: null, data: event.data };
}

export async function openStream(request: Request): Promise<Response> {
  const db = getDb();
  const features = await siteFeatures(db);
  const lastEventId =
    request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('last_event_id');
  const [status, online, map] = await Promise.all([
    computeStatus(db),
    computeOnline(db, features),
    getMap(db, features)
  ]);
  const replay = lastEventId
    ? await buildActivityItems(
        db,
        await feedRowsAfter(db, features, lastEventId, replayLimit),
        features
      )
    : [];
  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          return;
        }
      };
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      send(': connected\n\n');
      send(serializeFrame({ event: 'status', id: null, data: status }));
      send(serializeFrame({ event: 'online', id: null, data: online }));
      send(serializeFrame({ event: 'map', id: null, data: map }));
      for (const item of replay)
        send(serializeFrame({ event: 'activity', id: item.id, data: item }));
      unsubscribe = bus.subscribe((event) => send(serializeFrame(frameOf(event))));
      keepAlive = setInterval(() => send(': keep-alive\n\n'), keepAliveMs);
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      closed = true;
      if (keepAlive) clearInterval(keepAlive);
      if (unsubscribe) unsubscribe();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    }
  });
}
