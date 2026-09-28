import type { StreamFrame } from '$lib/api/types';
import { getFixture } from './fixtures';

export const replayIntervalMs = 10_000;
export const keepAliveIntervalMs = 15_000;

export function serializeFrame(frame: StreamFrame): string {
  const lines = [`event: ${frame.event}`];
  if (frame.id) lines.push(`id: ${frame.id}`);
  lines.push(`data: ${JSON.stringify(frame.data)}`);
  return lines.join('\n') + '\n\n';
}

export function framesAfter(frames: StreamFrame[], lastEventId: string | null): StreamFrame[] {
  if (!lastEventId) return [];
  const index = frames.findIndex((frame) => frame.event === 'activity' && frame.id === lastEventId);
  if (index === -1) return [];
  return frames
    .slice(index + 1)
    .filter((frame) => frame.event === 'activity')
    .slice(0, 100);
}

export function mockStream(request: Request): Response {
  const frames = (getFixture('stream') as StreamFrame[] | undefined) ?? [];
  const lastEventId =
    request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('last_event_id');
  const encoder = new TextEncoder();
  let replay: ReturnType<typeof setInterval> | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (replay) clearInterval(replay);
        if (keepAlive) clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          return;
        }
      };
      send(': connected\n\n');
      for (const frame of frames.slice(0, 2)) send(serializeFrame(frame));
      for (const frame of framesAfter(frames, lastEventId)) send(serializeFrame(frame));
      let index = 2 % Math.max(frames.length, 1);
      replay = setInterval(() => {
        if (frames.length === 0) return;
        send(serializeFrame(frames[index] as StreamFrame));
        index = (index + 1) % frames.length;
      }, replayIntervalMs);
      keepAlive = setInterval(() => send(': keep-alive\n\n'), keepAliveIntervalMs);
      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      closed = true;
      if (replay) clearInterval(replay);
      if (keepAlive) clearInterval(keepAlive);
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
