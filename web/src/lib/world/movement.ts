export const maxGapSeconds = 300;
export const maxSpeedMps = 80;

export interface Sample {
  x: number;
  y: number;
  seconds: number;
}

export function segmentMeters(from: Sample, to: Sample): number {
  const elapsed = to.seconds - from.seconds;
  if (!(elapsed > 0) || elapsed > maxGapSeconds) return 0;
  const meters = Math.hypot(to.x - from.x, to.y - from.y) / 100;
  if (meters / elapsed > maxSpeedMps) return 0;
  return meters;
}

export function isContinuous(from: Sample, to: Sample): boolean {
  const elapsed = to.seconds - from.seconds;
  if (!(elapsed > 0) || elapsed > maxGapSeconds) return false;
  return Math.hypot(to.x - from.x, to.y - from.y) / 100 / elapsed <= maxSpeedMps;
}
