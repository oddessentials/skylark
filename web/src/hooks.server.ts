import type { Handle, ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { loadEnv } from '$lib/server/env';
import { apiNotFound, apiRateLimit } from '$lib/server/hooks/api';
import { mock } from '$lib/server/hooks/mock';
import { jobs } from '$lib/server/jobs/registry';
import { startScheduler, type Scheduler } from '$lib/server/jobs/scheduler';

let scheduler: Scheduler | null = null;

export function getScheduler(): Scheduler | null {
  return scheduler;
}

export const init: ServerInit = async () => {
  const env = loadEnv();
  scheduler = startScheduler(jobs);
  console.log(
    `web ${__APP_VERSION__} ready: mock=${env.apiMock} log=${env.logLevel} jobs=${jobs.length}`
  );
};

export const handle: Handle = sequence(mock, apiRateLimit, apiNotFound);
