import type { Phase } from '$lib/world/clock';
import type { ClockReading, ClockState } from './worldclock.svelte';

const phaseNames: Record<Phase, string> = {
  night: 'Night',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening'
};

const stateNotes: Record<Exclude<ClockState, 'live'>, string> = {
  stopped: 'The server is not running',
  lost: 'Last known, the collector is silent',
  stale: 'Last known, out of touch'
};

export function phaseLabel(phase: Phase): string {
  return phaseNames[phase];
}

export function compactDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  return `${Math.max(1, Math.round(total / 60))} min`;
}

export function clockCountdown(reading: ClockReading): string {
  const what = reading.turn.kind === 'nightfall' ? 'Nightfall' : 'Dawn';
  return `${what} in ${compactDuration(reading.turn.inSeconds)}`;
}

export function clockNote(reading: ClockReading): string {
  return reading.state === 'live' ? clockCountdown(reading) : stateNotes[reading.state];
}

export function stripClock(reading: ClockReading): string {
  return `Day ${reading.day} · ${reading.clock}`;
}
