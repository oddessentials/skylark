<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let revealed = $state(false);
  let secret = $state<string | null>(null);
  let busy = $state(false);
  let message = $state('');
  let copied = $state(false);

  const collector = $derived(data.collector.ok ? data.collector.data : null);
  const shown = $derived(secret ?? collector?.secret ?? '');
  const masked = $derived(shown ? `${shown.slice(0, 4)}${'•'.repeat(24)}` : '');
  const config = $derived(
    [
      '[site]',
      `url = "${data.origin}"`,
      `secret = "${revealed ? shown : '<the secret above>'}"`,
      '',
      '[palworld]',
      'rest_url = "http://127.0.0.1:8212"',
      'admin_password = "<the AdminPassword in PalWorldSettings.ini>"',
      '',
      '[logs]',
      'source = "docker"'
    ].join('\n')
  );

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      message = 'The browser did not allow copying; select the text instead.';
    }
  }

  async function regenerate() {
    busy = true;
    message = '';
    try {
      secret = (await api.regenerateCollectorSecret()).secret;
      revealed = true;
      message = 'New secret stored. Give it to the collector; the old one no longer works.';
      await invalidateAll();
    } catch (error) {
      message =
        error instanceof ApiError && error.status === 409
          ? 'COLLECTOR_SECRET is set in the environment, so the secret cannot be replaced here.'
          : error instanceof Error
            ? error.message
            : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title="Collector" description="Connect the Skylark collector to this site." />

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Admin"
    note="The collector runs beside the Palworld server, reads its REST API, world snapshot and log, and posts signed batches here. It needs this site's address and the shared secret."
  >
    {#snippet heading()}Collector{/snippet}
  </PageHeader>

  {#if !collector}
    {#if !data.collector.ok}<ErrorNote error={data.collector.error} what="the collector" />{/if}
  {:else}
    <Card title="Shared secret">
      <div class="flex flex-col gap-3 text-[0.8125rem]">
        <div class="flex flex-wrap items-center gap-2">
          <code class="rounded bg-surface-sunken px-2 py-1 text-xs break-all"
            >{revealed ? shown : masked}</code
          >
          <button type="button" class="btn" onclick={() => (revealed = !revealed)}
            >{revealed ? 'Hide' : 'Show'}</button
          >
          <button type="button" class="btn" onclick={() => copy(shown)}
            >{copied ? 'Copied' : 'Copy'}</button
          >
          {#if !collector.secret_from_environment}
            <button type="button" class="btn btn-danger" disabled={busy} onclick={regenerate}
              >Replace</button
            >
          {/if}
        </div>
        {#if collector.secret_from_environment}
          <p class="note">set by COLLECTOR_SECRET in the site's environment.</p>
        {/if}
        {#if message}<p role="status">{message}</p>{/if}
      </div>
    </Card>

    <Card title="Collector settings">
      <p class="mb-3 text-[0.8125rem] text-ink-muted">
        A starting point for <code class="text-xs">skylark-collector.toml</code>. Every key can also
        come from the environment, for example
        <code class="text-xs">SKYLARK_SITE_URL</code> and
        <code class="text-xs">SKYLARK_SITE_SECRET</code>.
      </p>
      <pre
        class="overflow-x-auto rounded-(--radius-card) bg-surface-sunken p-4 text-xs leading-relaxed">{config}</pre>
      <p class="mt-3 text-[0.75rem] text-ink-muted">
        This site runs version {collector.site_version}. On Windows, let the collector launch the
        server (<code class="text-xs">source = "launch"</code>) so log lines arrive at once.
      </p>
    </Card>

    <Card title="Ingest, last 24 hours">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Batches" value={formatNumber(collector.ingest.batches_24h)} />
        <Stat label="Events" value={formatNumber(collector.ingest.events_24h)} />
        <Stat label="Duplicates" value={formatNumber(collector.ingest.duplicates_24h)} />
        <Stat label="Flagged" value={formatNumber(collector.ingest.invalid_24h)} />
        <Stat label="Rejected" value={formatNumber(collector.ingest.rejected_24h)} />
        <Stat label="Last batch"
          ><Time at={collector.ingest.last_batch_at} mode="relative" fallback="never" /></Stat
        >
      </div>
    </Card>

    <Card title="Runs" flush>
      {#if collector.runs.length === 0}
        <EmptyState message="No collector has connected yet." />
      {:else}
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Version</th>
                <th>Platform</th>
                <th>Server</th>
                <th>Last seen</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {#each collector.runs as run (run.run_id)}
                <tr>
                  <td><Time at={run.started_at} /></td>
                  <td>{run.version ?? '—'}</td>
                  <td>{run.os ?? '?'}/{run.arch ?? '?'}</td>
                  <td>{run.server_version ?? '—'}</td>
                  <td><Time at={run.last_seen_at} mode="relative" /></td>
                  <td>
                    {#if run.stopped_at}<span class="text-ink-muted">stopped</span
                      >{:else if run.lost_at}<span class="text-offline">lost</span>{:else}<span
                        class="text-online">running</span
                      >{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {/if}
</div>
