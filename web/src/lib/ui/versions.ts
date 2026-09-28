import type { Status } from '$lib/api/types';

const space = String.fromCharCode(160);
const dot = String.fromCharCode(183);

export function versionLine(
  site: string,
  status: Pick<Status, 'collector' | 'server'> | null | undefined
): string {
  const parts = [`Site${space}${site}`];
  if (status?.collector.version) parts.push(`Collector${space}${status.collector.version}`);
  if (status?.server.version) parts.push(`Palworld${space}${status.server.version}`);
  return parts.join(` ${dot} `);
}
