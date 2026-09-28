export interface JobDefinition {
  name: string;
  intervalMs: number;
  runOnStart?: boolean;
  run: (signal: AbortSignal) => Promise<void>;
}

export interface JobStatus {
  name: string;
  intervalMs: number;
  running: boolean;
  runs: number;
  skippedOverlaps: number;
  lastRunAt: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
}

export interface Scheduler {
  status(): JobStatus[];
  trigger(name: string): Promise<void>;
  stop(): Promise<void>;
}

interface JobState {
  definition: JobDefinition;
  timer: NodeJS.Timeout | null;
  inFlight: Promise<void> | null;
  status: JobStatus;
}

export type SchedulerLog = (level: 'info' | 'warn' | 'error', message: string) => void;

export interface SchedulerOptions {
  log?: SchedulerLog;
  registerSignals?: boolean;
}

const defaultLog: SchedulerLog = (level, message) => {
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);
};

export function startScheduler(jobs: JobDefinition[], options: SchedulerOptions = {}): Scheduler {
  const log = options.log ?? defaultLog;
  const controller = new AbortController();
  const states = new Map<string, JobState>();

  for (const definition of jobs) {
    if (states.has(definition.name)) throw new Error(`duplicate job name: ${definition.name}`);
    states.set(definition.name, {
      definition,
      timer: null,
      inFlight: null,
      status: {
        name: definition.name,
        intervalMs: definition.intervalMs,
        running: false,
        runs: 0,
        skippedOverlaps: 0,
        lastRunAt: null,
        lastFinishedAt: null,
        lastOk: null,
        lastError: null
      }
    });
  }

  function execute(state: JobState): Promise<void> {
    if (state.inFlight) {
      state.status.skippedOverlaps += 1;
      return state.inFlight;
    }
    if (controller.signal.aborted) return Promise.resolve();
    state.status.running = true;
    state.status.lastRunAt = new Date().toISOString();
    const run = state.definition
      .run(controller.signal)
      .then(() => {
        state.status.lastOk = true;
        state.status.lastError = null;
      })
      .catch((error: unknown) => {
        state.status.lastOk = false;
        state.status.lastError = error instanceof Error ? error.message : String(error);
        log('error', `job ${state.definition.name} failed: ${state.status.lastError}`);
      })
      .finally(() => {
        state.status.running = false;
        state.status.runs += 1;
        state.status.lastFinishedAt = new Date().toISOString();
        state.inFlight = null;
      });
    state.inFlight = run;
    return run;
  }

  for (const state of states.values()) {
    const timer = setInterval(() => void execute(state), state.definition.intervalMs);
    timer.unref();
    state.timer = timer;
    if (state.definition.runOnStart) void execute(state);
  }

  let stopped: Promise<void> | null = null;
  function stop(): Promise<void> {
    if (stopped) return stopped;
    stopped = (async () => {
      controller.abort();
      for (const state of states.values()) {
        if (state.timer) clearInterval(state.timer);
        state.timer = null;
      }
      await Promise.all([...states.values()].map((state) => state.inFlight ?? Promise.resolve()));
      log('info', `scheduler stopped (${states.size} job(s))`);
    })();
    return stopped;
  }

  if (options.registerSignals ?? true) {
    const onShutdown = () => void stop();
    process.once('sveltekit:shutdown', onShutdown);
    process.once('SIGINT', onShutdown);
    process.once('SIGTERM', onShutdown);
  }

  if (states.size > 0) log('info', `scheduler started: ${[...states.keys()].join(', ')}`);

  return {
    status: () => [...states.values()].map((state) => ({ ...state.status })),
    trigger: (name) => {
      const state = states.get(name);
      if (!state) return Promise.reject(new Error(`unknown job: ${name}`));
      return execute(state);
    },
    stop
  };
}
