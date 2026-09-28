<script lang="ts">
  import type { Status } from '$lib/api/types';
  import type { LiveStreamState } from './live.svelte';
  import type { LoadFailure } from './load';
  import { stripClock } from './sunclock';
  import Time from './Time.svelte';
  import { worldClock } from './worldclock.svelte';

  let {
    status,
    error,
    stream
  }: { status: Status | null; error: LoadFailure | null; stream: LiveStreamState } = $props();

  const reading = $derived(worldClock.reading(status));
  const stateLabel = $derived(
    status?.state === 'online'
      ? 'Server online'
      : status?.state === 'offline'
        ? 'Server offline'
        : 'Status unknown'
  );
  const lampClass = $derived(
    status?.state === 'online'
      ? 'text-online'
      : status?.state === 'offline'
        ? 'text-offline'
        : 'text-warning'
  );
  const collectorNote = $derived(
    status?.collector.state === 'lost'
      ? 'Lost contact with the collector'
      : status?.collector.state === 'stopped'
        ? 'The collector stopped'
        : status?.collector.state === 'none'
          ? 'No collector has reported yet'
          : null
  );
  const streamLabel = $derived(
    stream === 'open'
      ? 'live'
      : stream === 'connecting'
        ? 'connecting'
        : stream === 'reconnecting'
          ? 'reconnecting'
          : stream === 'closed'
            ? 'stream closed'
            : 'not live'
  );
</script>

<div
  class="ticker relative z-10 border-y border-line/80 bg-surface-raised/70 backdrop-blur-md"
  role="status"
  aria-live="polite"
>
  <div
    class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-(--gutter) py-1.5"
  >
    {#if status}
      <a href="/" class="flex min-h-6 items-center gap-2 text-ink hover:text-accent">
        <span class="lamp {lampClass}" aria-hidden="true"></span>
        {stateLabel}
      </a>
      {#if status.state === 'online'}
        <span>{status.players.online} of {status.players.max ?? '?'} players</span>
      {/if}
      {#if reading}
        <a
          href="/#clock"
          class="inline-flex min-h-6 items-center text-ink hover:text-accent"
          data-clock>{stripClock(reading)}</a
        >
      {/if}
      {#if collectorNote}
        <span class="text-warning">
          {collectorNote}
          {#if status.collector.last_seen_at && status.collector.state === 'lost'}
            <span>, last heard <Time at={status.collector.last_seen_at} mode="relative" /></span>
          {/if}
        </span>
      {:else if status.since && status.state === 'online'}
        <span class="hidden sm:inline">up since <Time at={status.since} mode="relative" /></span>
      {/if}
    {:else}
      <span class="text-warning">Status unavailable{error ? ` (${error.code})` : ''}</span>
    {/if}
    <span class="ml-auto flex items-center gap-2" title="Live updates from /api/v1/stream">
      <span
        class="inline-block size-1.5 rounded-full {stream === 'open'
          ? 'live-dot bg-online shadow-[0_0_8px_var(--color-online)]'
          : stream === 'off'
            ? 'bg-line-strong'
            : 'bg-warning'}"
        aria-hidden="true"
      ></span>
      {streamLabel}
    </span>
  </div>
</div>
