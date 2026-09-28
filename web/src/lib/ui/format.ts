const units = {
  minute: 60,
  hour: 3600,
  day: 86400
};

export function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function formatDateTime(value: string | null | undefined, local: boolean): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: local ? undefined : 'UTC'
  }).format(ms);
}

export function formatDate(value: string | null | undefined, local: boolean): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: local ? undefined : 'UTC'
  }).format(ms);
}

export function formatTime(value: string | null | undefined, local: boolean): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: local ? undefined : 'UTC'
  }).format(ms);
}

export function formatUtc(value: string | null | undefined): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  return new Date(ms)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
}

export function relativeTime(value: string | null | undefined, now: number): string {
  const ms = parseInstant(value);
  if (ms === null) return '';
  const delta = Math.round((now - ms) / 1000);
  const past = delta >= 0;
  const seconds = Math.abs(delta);
  if (seconds < 45) return 'just now';
  let text: string;
  if (seconds < units.hour) text = `${Math.max(1, Math.round(seconds / units.minute))} min`;
  else if (seconds < units.day) text = `${Math.round(seconds / units.hour)} h`;
  else if (seconds < units.day * 14) text = `${Math.round(seconds / units.day)} d`;
  else if (seconds < units.day * 60) text = `${Math.round(seconds / (units.day * 7))} wk`;
  else text = `${Math.round(seconds / (units.day * 30))} mo`;
  return past ? `${text} ago` : `in ${text}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const days = Math.floor(total / units.day);
  const hours = Math.floor((total % units.day) / units.hour);
  const minutes = Math.floor((total % units.hour) / units.minute);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  const rest = total % units.minute;
  if (total < 600 && rest > 0) return `${minutes} min ${rest} s`;
  return `${minutes} min`;
}

export function formatHours(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const hours = seconds / units.hour;
  if (hours < 1) return `${Math.round(seconds / units.minute)} min`;
  if (hours < 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours)} h`;
}

export function formatPerHour(
  count: number | null | undefined,
  seconds: number | null | undefined
): string {
  if (count === null || count === undefined || !seconds || seconds < 0) return '';
  const rate = count / (seconds / units.hour);
  return rate < 10 ? rate.toFixed(2) : rate.toFixed(1);
}

export function formatMillis(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatDistance(metres: number | null | undefined): string {
  if (metres === null || metres === undefined) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatMegabytes(mb: number | null | undefined): string {
  if (mb === null || mb === undefined) return '';
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function formatPosition(x: number | null | undefined, z: number | null | undefined): string {
  if (x === null || x === undefined || z === null || z === undefined) return '';
  return `${Math.round(x)}, ${Math.round(z)}`;
}

export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '';
  return `${Math.round(fraction * 100)}%`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
