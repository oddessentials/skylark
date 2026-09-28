<script lang="ts">
  import { onDestroy } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import type { Job } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatBytes, formatDuration, formatMegabytes, formatNumber } from '$lib/ui/format';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let job = $state<Job | null>(null);
  let message = $state('');
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const health = $derived(data.health.ok ? data.health.data : null);
  const collector = $derived(health?.collector ?? null);
  const stateTone = $derived(
    collector?.state === 'active'
      ? 'text-online'
      : collector?.state === 'lost'
        ? 'text-offline'
        : 'text-warning'
  );
  const stateLabels: Record<string, string> = {
    active: 'connected',
    stopped: 'stopped',
    lost: 'lost contact',
    none: 'never connected'
  };
  const layerTone = (value: string | null) =>
    value === 'ok'
      ? 'text-online'
      : value === 'off' || value === null
        ? 'text-ink-muted'
        : 'text-warning';

  async function poll(id: number) {
    try {
      job = await api.getJob(id);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      return;
    }
    if (job.state === 'queued' || job.state === 'running') {
      timer = setTimeout(() => poll(id), 2000);
    } else {
      await invalidateAll();
    }
  }

  async function run(kind: 'projections_rebuild' | 'backup') {
    busy = true;
    message = '';
    try {
      const accepted = kind === 'backup' ? await api.runBackup() : await api.rebuildProjections();
      job = {
        id: accepted.job_id,
        kind,
        state: 'queued',
        progress: null,
        started_at: null,
        finished_at: null,
        error: null
      };
      await poll(accepted.job_id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        message = 'A job is already running. Wait for it to finish.';
      } else {
        message = error instanceof Error ? error.message : String(error);
      }
    } finally {
      busy = false;
    }
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<Meta title="Admin health" description="The collector connection, ingest, backups and jobs." />

<div class="flex flex-col gap-6">
  <PageHeader eyebrow="Admin">
    {#snippet heading()}Site health{/snippet}
  </PageHeader>

  {#if !health || !collector}
    {#if !data.health.ok}<ErrorNote error={data.health.error} what="the health report" />{/if}
  {:else}
    <Card title="Collector">
      {#snippet actions()}
        <a href="/admin/collector" class="btn">Connection</a>
      {/snippet}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="State">
          <span class={stateTone}>{stateLabels[collector.state] ?? collector.state}</span>
        </Stat>
        <Stat label="Heartbeat">
          {#if collector.heartbeat_age_s === null}never{:else}{formatDuration(
              collector.heartbeat_age_s
            )} ago{/if}
        </Stat>
        <Stat label="REST"
          ><span class={layerTone(collector.rest)}>{collector.rest ?? '—'}</span></Stat
        >
        <Stat label="Game data"
          ><span class={layerTone(collector.gamedata)}>{collector.gamedata ?? '—'}</span></Stat
        >
        <Stat label="Logs"
          ><span class={layerTone(collector.logs)}>{collector.logs ?? '—'}</span></Stat
        >
        <Stat
          label="Queued, dropped"
          value="{collector.queue_depth === null
            ? '—'
            : formatNumber(collector.queue_depth)}, {collector.dropped_events === null
            ? '—'
            : formatNumber(collector.dropped_events)}"
        />
      </div>
      {#if collector.run}
        <p class="mt-4 text-[0.8125rem] text-ink-muted">
          Run started <Time at={collector.run.started_at} />, collector {collector.run.version ??
            'unknown'} on {collector.run.os ?? '?'}/{collector.run.arch ?? '?'}, server {collector
            .run.server_version ?? 'unknown'}.
        </p>
        {#if collector.run.version && data.version && collector.run.version !== data.version}
          <p class="mt-2 text-[0.8125rem] text-warning">
            The collector is {collector.run.version} and this site is {data.version}. They work
            together, but matching versions get every feature.
          </p>
        {/if}
      {/if}
    </Card>

    <div class="grid gap-6 lg:grid-cols-3">
      <Card title="Ingest, last 24 hours">
        <div class="grid grid-cols-2 gap-4">
          <Stat label="Batches" value={formatNumber(health.ingest.batches_24h)} />
          <Stat label="Events" value={formatNumber(health.ingest.events_24h)} />
          <Stat label="Duplicates" value={formatNumber(health.ingest.duplicates_24h)} />
          <Stat label="Flagged">
            <span class={health.ingest.invalid_24h > 0 ? 'text-warning' : ''}
              >{formatNumber(health.ingest.invalid_24h)}</span
            >
          </Stat>
          <Stat label="Rejected">
            <span class={health.ingest.rejected_24h > 0 ? 'text-offline' : ''}
              >{formatNumber(health.ingest.rejected_24h)}</span
            >
          </Stat>
          <Stat label="Last batch"
            ><Time at={health.ingest.last_batch_at} mode="relative" fallback="never" /></Stat
          >
        </div>
      </Card>
      <Card title="Database">
        <div class="grid grid-cols-2 gap-4">
          <Stat label="Events" value={formatNumber(health.db.events_total)} />
          <Stat label="Positions" value={formatNumber(health.db.positions_total)} />
          <Stat label="Size" value={formatMegabytes(health.db.size_mb)} />
        </div>
      </Card>
      <Card title="Backups">
        <div class="grid grid-cols-2 gap-4">
          <Stat label="Last backup"
            ><Time at={health.backup.last_at} mode="relative" fallback="never" /></Stat
          >
          <Stat
            label="Size"
            value={health.backup.size_mb === null ? '—' : formatMegabytes(health.backup.size_mb)}
          />
          <Stat label="Kept" value={formatNumber(health.backup.kept)} detail="nightly dumps" />
        </div>
      </Card>
    </div>

    <Card title="Background jobs" flush>
      {#if health.jobs.length === 0}
        <EmptyState message="No jobs registered." />
      {:else}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead><tr><th>Job</th><th>Last run</th><th>Result</th></tr></thead>
            <tbody>
              {#each health.jobs as entry (entry.name)}
                <tr>
                  <td><code class="text-xs">{entry.name}</code></td>
                  <td><Time at={entry.last_run_at} mode="relative" fallback="never" /></td>
                  <td>
                    {#if entry.last_ok === null}
                      <span class="text-ink-muted">not run yet</span>
                    {:else if entry.last_ok}
                      <span class="text-online">ok</span>
                    {:else}
                      <span class="text-offline">failed: {entry.last_error ?? 'unknown error'}</span
                      >
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {/if}

  <Card title="Maintenance">
    <div class="flex flex-wrap items-center gap-3 text-[0.8125rem]">
      <button type="button" class="btn" disabled={busy} onclick={() => run('projections_rebuild')}
        >Rebuild history</button
      >
      <button type="button" class="btn" disabled={busy} onclick={() => run('backup')}
        >Back up now</button
      >
      {#if job}
        <span role="status">
          Job {job.id} ({job.kind === 'backup' ? 'backup' : 'rebuild'}):
          <span
            class={job.state === 'failed'
              ? 'text-offline'
              : job.state === 'done'
                ? 'text-online'
                : 'text-warning'}>{job.state}</span
          >
          {#if job.progress !== null && job.state === 'running'}{Math.round(
              job.progress * 100
            )}%{/if}
          {#if job.error}<span class="text-offline">{job.error}</span>{/if}
        </span>
      {/if}
      {#if message}<span class="text-danger" role="alert">{message}</span>{/if}
    </div>
    <p class="mt-4 text-[0.75rem] leading-relaxed text-ink-muted">
      A rebuild replays every stored event into sessions, level-ups, knockouts, chat and the player
      totals. The live world (positions, bases, Pals) is kept. Ingest pauses while it runs.
    </p>
  </Card>

  <Card title="Backup files" flush>
    {#if !data.backups.ok}
      <div class="p-4"><ErrorNote error={data.backups.error} what="the backup list" /></div>
    {:else if data.backups.data.items.length === 0}
      <EmptyState message="No backup has been written yet." />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr><th>Taken</th><th>File</th><th class="num">Size</th><th>Result</th></tr></thead
          >
          <tbody>
            {#each data.backups.data.items as backup (backup.file)}
              <tr>
                <td><Time at={backup.at} /></td>
                <td><code class="text-xs">{backup.file}</code></td>
                <td class="num">{formatBytes(backup.size_bytes)}</td>
                <td class={backup.ok ? 'text-online' : 'text-offline'}
                  >{backup.ok ? 'ok' : 'failed'}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>
</div>
