import { browser } from '$app/environment';
import type { Status } from '$lib/api/types';
import {
  advance,
  formatClock,
  nextTurn,
  parseClock,
  phaseOf,
  speedsOf,
  type Phase,
  type Turn
} from '$lib/world/clock';

export type ClockState = 'live' | 'stopped' | 'stale' | 'lost';

export interface ClockReading {
  state: ClockState;
  day: number;
  minute: number;
  clock: string;
  phase: Phase;
  turn: Turn;
}

export const staleAfterMs = 180_000;
export const tickMs = 1000;

function stateOf(status: Status, now: number, observedAt: number): ClockState {
  if (status.collector.state !== 'active') return 'lost';
  if (status.state !== 'online') return 'stopped';
  if (now - observedAt > staleAfterMs) return 'stale';
  return 'live';
}

export function readingAt(status: Status | null, now: number): ClockReading | null {
  const clock = status?.clock;
  const minute = parseClock(clock?.time);
  if (!status || !clock || minute === null || clock.day === null || !clock.observed_at) {
    return null;
  }
  const observedAt = Date.parse(clock.observed_at);
  if (Number.isNaN(observedAt)) return null;
  const speeds = speedsOf(clock.day_speed, clock.night_speed);
  const state = stateOf(status, now, observedAt);
  const elapsed =
    state === 'live' ? (now - observedAt) / 1000 : state === 'stale' ? staleAfterMs / 1000 : 0;
  const point = advance({ day: clock.day, minute }, elapsed, speeds);
  return {
    state,
    day: point.day,
    minute: point.minute,
    clock: formatClock(point.minute),
    phase: phaseOf(point.minute),
    turn: nextTurn(point.minute, speeds)
  };
}

export class WorldClock {
  #now = $state(Date.now());
  #timer: ReturnType<typeof setInterval> | null = null;

  start(): () => void {
    if (!browser) return () => {};
    this.#now = Date.now();
    this.#timer ??= setInterval(() => {
      if (!document.hidden) this.#now = Date.now();
    }, tickMs);
    return () => {
      if (this.#timer) clearInterval(this.#timer);
      this.#timer = null;
    };
  }

  reading(status: Status | null): ClockReading | null {
    return readingAt(status, browser ? this.#now : Date.now());
  }
}

export const worldClock = new WorldClock();
