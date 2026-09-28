import { describe, expect, it } from 'vitest';
import {
  advance,
  formatClock,
  nextTurn,
  parseClock,
  phaseOf,
  realMinutesPerDay,
  speedsOf
} from '$lib/world/clock';
import { readingAt } from '$lib/ui/worldclock.svelte';
import type { Status } from '$lib/api/types';

const plain = speedsOf(1, 1);

describe('the in-game clock', () => {
  it('parses and formats the server clock', () => {
    expect(parseClock('05:03')).toBe(303);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock(null)).toBeNull();
    expect(formatClock(303)).toBe('05:03');
    expect(formatClock(1440 + 61.9)).toBe('01:01');
  });

  it('runs 45 in-game minutes per real minute by day', () => {
    expect(advance({ day: 0, minute: 6 * 60 }, 60, plain)).toEqual({ day: 0, minute: 405 });
  });

  it('runs the night rate from 23:00 to 03:00, as the probe measured', () => {
    const fast = speedsOf(1, 4);
    const at = advance({ day: 0, minute: 22 * 60 }, 60 + 60, fast);
    expect(at.day).toBe(1);
    expect(Math.round(at.minute)).toBe(60);
    expect(realMinutesPerDay(fast)).toBeCloseTo(1200 / 45 + 240 / 180, 5);
    expect(realMinutesPerDay(plain)).toBeCloseTo(32, 5);
  });

  it('counts down to the next turn and names the phases', () => {
    expect(nextTurn(22 * 60, plain)).toEqual({ kind: 'nightfall', inSeconds: 80 });
    expect(nextTurn(1 * 60, speedsOf(1, 2))).toEqual({ kind: 'dawn', inSeconds: 80 });
    expect(phaseOf(2 * 60)).toBe('night');
    expect(phaseOf(8 * 60)).toBe('morning');
    expect(phaseOf(14 * 60)).toBe('afternoon');
    expect(phaseOf(20 * 60)).toBe('evening');
    expect(phaseOf(23 * 60 + 30)).toBe('night');
  });
});

describe('a clock reading from the status', () => {
  const status = (overrides: Partial<Status> = {}): Status => ({
    state: 'online',
    since: null,
    server: { name: 'Test', description: null, version: 'v1.0.5.102999' },
    players: { online: 0, max: 32 },
    performance: {
      fps: null,
      fps_avg: null,
      frame_time_ms: null,
      uptime_s: null,
      measured_at: null
    },
    clock: {
      time: '22:00',
      day: 12,
      observed_at: '2026-09-27T20:00:00.000Z',
      day_speed: 1,
      night_speed: 1
    },
    collector: { state: 'active', version: '0.1.0', last_seen_at: null, layers: null },
    updated_at: '2026-09-27T20:00:00.000Z',
    ...overrides
  });

  it('advances from the observed time while live', () => {
    const reading = readingAt(status(), Date.parse('2026-09-27T20:02:00.000Z'));
    expect(reading).toMatchObject({ state: 'live', day: 12, clock: '23:30', phase: 'night' });
  });

  it('holds the last value when the server or the collector is gone', () => {
    expect(
      readingAt(status({ state: 'offline' }), Date.parse('2026-09-27T21:00:00Z'))
    ).toMatchObject({ state: 'stopped', clock: '22:00' });
    expect(
      readingAt(
        status({ collector: { state: 'lost', version: null, last_seen_at: null, layers: null } }),
        Date.parse('2026-09-27T21:00:00Z')
      )
    ).toMatchObject({ state: 'lost', clock: '22:00' });
  });
});
