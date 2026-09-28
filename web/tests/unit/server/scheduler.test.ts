import { describe, expect, it } from 'vitest';
import { startScheduler } from '$lib/server/jobs/scheduler';

const silent = () => {};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('scheduler', () => {
  it('runs jobs on their interval, never overlapping, and isolates failures', async () => {
    let running = 0;
    let maxConcurrent = 0;
    let slowCalls = 0;
    const scheduler = startScheduler(
      [
        {
          name: 'slow',
          intervalMs: 10,
          run: async () => {
            slowCalls += 1;
            running += 1;
            maxConcurrent = Math.max(maxConcurrent, running);
            await wait(35);
            running -= 1;
          }
        },
        {
          name: 'failing',
          intervalMs: 10,
          run: async () => {
            throw new Error('boom');
          }
        }
      ],
      { registerSignals: false, log: silent }
    );

    await wait(150);

    const status = Object.fromEntries(scheduler.status().map((entry) => [entry.name, entry]));
    expect(maxConcurrent).toBe(1);
    expect(status.slow?.skippedOverlaps).toBeGreaterThan(0);
    expect(status.slow?.runs).toBeGreaterThanOrEqual(2);
    expect(status.slow?.lastOk).toBe(true);
    expect(status.failing?.runs).toBeGreaterThanOrEqual(5);
    expect(status.failing?.lastOk).toBe(false);
    expect(status.failing?.lastError).toBe('boom');

    await scheduler.stop();
    const callsAtStop = slowCalls;
    await wait(60);
    expect(slowCalls).toBe(callsAtStop);
  });

  it('records the last run and supports manual triggers', async () => {
    let calls = 0;
    const scheduler = startScheduler(
      [
        {
          name: 'quick',
          intervalMs: 60_000,
          runOnStart: true,
          run: async () => {
            calls += 1;
          }
        }
      ],
      { registerSignals: false, log: silent }
    );
    await wait(5);
    expect(calls).toBe(1);
    await scheduler.trigger('quick');
    expect(calls).toBe(2);
    const [status] = scheduler.status();
    expect(status?.runs).toBe(2);
    expect(status?.lastRunAt).not.toBeNull();
    expect(status?.lastFinishedAt).not.toBeNull();
    await expect(scheduler.trigger('missing')).rejects.toThrow('unknown job: missing');
    await scheduler.stop();
  });

  it('rejects duplicate job names', () => {
    const job = { name: 'twice', intervalMs: 1000, run: async () => {} };
    expect(() => startScheduler([job, job], { registerSignals: false, log: silent })).toThrow(
      'duplicate job name: twice'
    );
  });
});
