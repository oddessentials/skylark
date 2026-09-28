import { describe, expect, it } from 'vitest';
import type { StreamFrame } from '$lib/api/types';
import { framesAfter, mockStream, serializeFrame } from '$lib/server/mock/sse';

const activity = (id: string): StreamFrame => ({
  event: 'activity',
  id,
  data: {
    id,
    ts: '2026-09-20T19:00:00Z',
    type: 'player.level_up',
    player: { id: 1, name: 'Wren' },
    details: { from: 11, to: 12 }
  }
});

describe('mock stream', () => {
  it('serializes frames as server-sent events', () => {
    const text = serializeFrame(activity('abc'));
    expect(text).toBe(
      'event: activity\nid: abc\ndata: ' + JSON.stringify(activity('abc').data) + '\n\n'
    );
  });

  it('replays only the activity frames after the last seen id', () => {
    const frames = [activity('1'), activity('2'), activity('3')];
    expect(framesAfter(frames, '1').map((frame) => frame.id)).toEqual(['2', '3']);
    expect(framesAfter(frames, '3')).toEqual([]);
    expect(framesAfter(frames, 'unknown')).toEqual([]);
    expect(framesAfter(frames, null)).toEqual([]);
  });

  it('sends the status and online frames on connect', async () => {
    const controller = new AbortController();
    const response = mockStream(
      new Request('http://test/api/v1/stream', { signal: controller.signal })
    );
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    let received = '';
    while (!received.includes('event: online')) {
      const { value, done } = await reader!.read();
      if (done) break;
      received += new TextDecoder().decode(value);
    }
    controller.abort();
    expect(received).toContain('event: status');
    expect(received).toContain('event: online');
  });
});
