export const clockFactsVersion = '1.0.5.102999';
export const inGameMinutesPerRealMinute = 45;
export const minutesPerDay = 1440;
export const dawnMinute = 6 * 60;
export const duskMinute = 18 * 60;

export type Phase = 'night' | 'morning' | 'afternoon' | 'evening';

export interface Speeds {
  day: number;
  night: number;
}

export interface ClockPoint {
  day: number;
  minute: number;
}

export interface Turn {
  kind: 'dawn' | 'nightfall';
  inSeconds: number;
}

export function parseClock(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClock(minute: number): string {
  const whole = Math.floor(((minute % minutesPerDay) + minutesPerDay) % minutesPerDay);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function isNight(minute: number): boolean {
  return minute < dawnMinute || minute >= duskMinute;
}

export function speedsOf(day: number | null | undefined, night: number | null | undefined): Speeds {
  const clean = (value: number | null | undefined) =>
    value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
  return { day: clean(day), night: clean(night) };
}

function perRealSecond(minute: number, speeds: Speeds): number {
  return (inGameMinutesPerRealMinute / 60) * (isNight(minute) ? speeds.night : speeds.day);
}

function nextBoundary(minute: number): number {
  if (minute < dawnMinute) return dawnMinute;
  if (minute < duskMinute) return duskMinute;
  return minutesPerDay + dawnMinute;
}

export function advance(start: ClockPoint, realSeconds: number, speeds: Speeds): ClockPoint {
  let day = start.day;
  let minute = start.minute;
  let left = Math.max(0, realSeconds);
  for (let guard = 0; guard < 10_000 && left > 0; guard++) {
    const rate = perRealSecond(minute, speeds);
    const boundary = nextBoundary(minute);
    const needed = (boundary - minute) / rate;
    if (needed > left) {
      minute += left * rate;
      left = 0;
    } else {
      minute = boundary;
      left -= needed;
    }
    if (minute >= minutesPerDay) {
      minute -= minutesPerDay;
      day += 1;
    }
  }
  return { day, minute };
}

export function nextTurn(minute: number, speeds: Speeds): Turn {
  const boundary = nextBoundary(minute);
  return {
    kind: boundary % minutesPerDay === dawnMinute ? 'dawn' : 'nightfall',
    inSeconds: (boundary - minute) / perRealSecond(minute, speeds)
  };
}

export function phaseOf(minute: number): Phase {
  if (isNight(minute)) return 'night';
  if (minute < 12 * 60) return 'morning';
  if (minute < 16 * 60) return 'afternoon';
  return 'evening';
}

export function realMinutesPerDay(speeds: Speeds): number {
  const dayMinutes = duskMinute - dawnMinute;
  const nightMinutes = minutesPerDay - dayMinutes;
  return (
    dayMinutes / (inGameMinutesPerRealMinute * speeds.day) +
    nightMinutes / (inGameMinutesPerRealMinute * speeds.night)
  );
}
