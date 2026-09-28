import { nightlyBackupDue, runBackup } from './backup';
import { runPrune } from './prune';
import { isRunning } from './runner';
import { sampleStatus } from './sampler';
import { runWatchdog } from './watchdog';
import { env } from '../env';
import { publishAfterIngest, publishStatus } from '../stream/publish';
import type { JobDefinition } from './scheduler';

export const jobNames = {
  collectorWatchdog: 'collector_watchdog',
  statusSampler: 'status_sampler',
  retentionPrune: 'retention_prune',
  nightlyBackup: 'nightly_backup',
  streamBroadcaster: 'stream_broadcaster'
} as const;

const unlessMock = (run: () => Promise<void>) => async (): Promise<void> => {
  if (env.apiMock) return;
  await run();
};

export const jobs: JobDefinition[] = [
  {
    name: jobNames.collectorWatchdog,
    intervalMs: 30_000,
    runOnStart: true,
    run: unlessMock(async () => {
      if (isRunning('projections_rebuild')) return;
      const result = await runWatchdog();
      if (result.siteEvents.length > 0) {
        await publishAfterIngest(result.siteEvents, {
          statusChanged: true,
          onlineChanged: true,
          mapChanged: true
        });
      }
    })
  },
  {
    name: jobNames.statusSampler,
    intervalMs: 60_000,
    runOnStart: true,
    run: unlessMock(async () => {
      await sampleStatus();
    })
  },
  {
    name: jobNames.retentionPrune,
    intervalMs: 20 * 60_000,
    runOnStart: true,
    run: unlessMock(async () => {
      await runPrune();
    })
  },
  {
    name: jobNames.nightlyBackup,
    intervalMs: 10 * 60_000,
    runOnStart: false,
    run: unlessMock(async () => {
      if (isRunning('backup') || !(await nightlyBackupDue())) return;
      await runBackup();
    })
  },
  {
    name: jobNames.streamBroadcaster,
    intervalMs: 10_000,
    runOnStart: true,
    run: unlessMock(async () => {
      await publishStatus();
    })
  }
];
