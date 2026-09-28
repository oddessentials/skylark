<script lang="ts">
  import { browser } from '$app/environment';
  import type { StatusHistory } from '$lib/api/types';
  import { clock } from './clock.svelte';
  import { formatDateTime, formatUtc, parseInstant } from './format';

  let { history, maxPlayers = 32 }: { history: StatusHistory; maxPlayers?: number | null } =
    $props();

  let width = $state(640);
  const height = 150;
  const padLeft = 26;
  const padRight = 8;
  const padTop = 8;
  const padBottom = 22;

  const points = $derived(
    history.points
      .map((point) => ({ ...point, ms: parseInstant(point.ts) ?? 0 }))
      .filter((point) => point.ms > 0)
      .sort((a, b) => a.ms - b.ms)
  );
  const stepMs = $derived(history.bucket_s * 1000);
  const first = $derived(points[0]?.ms ?? 0);
  const last = $derived((points[points.length - 1]?.ms ?? 1) + stepMs);
  const span = $derived(Math.max(1, last - first));
  const peak = $derived(Math.max(1, ...points.map((point) => point.players_max)));
  const top = $derived(Math.max(peak, Math.min(maxPlayers ?? peak, peak + 1)));
  const plotWidth = $derived(width - padLeft - padRight);
  const plotHeight = height - padTop - padBottom;

  function xOf(ms: number): number {
    return padLeft + ((ms - first) / span) * plotWidth;
  }

  function yOf(count: number): number {
    return padTop + plotHeight - (count / top) * plotHeight;
  }

  const area = $derived.by(() => {
    if (points.length === 0) return '';
    const parts: string[] = [`M${xOf(first).toFixed(1)},${yOf(0).toFixed(1)}`];
    for (const point of points) {
      parts.push(`L${xOf(point.ms).toFixed(1)},${yOf(point.players_max).toFixed(1)}`);
      parts.push(`L${xOf(point.ms + stepMs).toFixed(1)},${yOf(point.players_max).toFixed(1)}`);
    }
    parts.push(`L${xOf(last).toFixed(1)},${yOf(0).toFixed(1)}Z`);
    return parts.join(' ');
  });

  const bands = $derived.by(() => {
    const out: { x: number; w: number; state: string }[] = [];
    for (const point of points) {
      if (point.state === 'online') continue;
      out.push({ x: xOf(point.ms), w: xOf(point.ms + stepMs) - xOf(point.ms), state: point.state });
    }
    return out;
  });

  const local = $derived(browser ? clock.local : false);
  const ticks = $derived.by(() => {
    if (points.length === 0) return [];
    const count = width < 480 ? 2 : 4;
    const out: { x: number; label: string }[] = [];
    for (let i = 0; i <= count; i++) {
      const ms = first + (span * i) / count;
      const label = new Intl.DateTimeFormat(
        undefined,
        history.range === '24h'
          ? { hour: '2-digit', minute: '2-digit', timeZone: local ? undefined : 'UTC' }
          : { month: 'short', day: 'numeric', timeZone: local ? undefined : 'UTC' }
      ).format(new Date(ms));
      out.push({ x: xOf(ms), label });
    }
    return out;
  });

  const yTicks = $derived(top <= 5 ? [...Array(top + 1).keys()] : [0, Math.round(top / 2), top]);
  const description = $derived(
    points.length === 0
      ? 'No samples yet'
      : `${points.length} buckets from ${formatDateTime(points[0]!.ts, local)} to ${formatDateTime(points[points.length - 1]!.ts, local)}, peak ${peak}`
  );
</script>

{#if points.length === 0}
  <p class="note">No samples in this window yet.</p>
{:else}
  <div bind:clientWidth={width}>
    <svg
      viewBox="0 0 {width} {height}"
      {height}
      class="block w-full font-sans text-ink-muted"
      role="img"
      aria-label="Players online over time. {description}"
    >
      <title>{formatUtc(points[0]!.ts)} to {formatUtc(points[points.length - 1]!.ts)}</title>
      {#each bands as band, index (index)}
        <rect
          x={band.x}
          y={padTop}
          width={Math.max(band.w, 1)}
          height={plotHeight}
          fill={band.state === 'offline' ? 'var(--color-offline)' : 'var(--color-warning)'}
          opacity="0.14"
        />
      {/each}
      {#each yTicks as tick (tick)}
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={yOf(tick)}
          y2={yOf(tick)}
          stroke="var(--color-line)"
        />
        <text x={padLeft - 6} y={yOf(tick) + 3} text-anchor="end" font-size="10" fill="currentColor"
          >{tick}</text
        >
      {/each}
      <path
        d={area}
        fill="var(--color-sky)"
        fill-opacity="0.35"
        stroke="var(--color-sky-deep)"
        stroke-width="1.5"
      />
      {#each ticks as tick, index (index)}
        <text
          x={tick.x}
          y={height - 6}
          text-anchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
          font-size="10"
          fill="currentColor">{tick.label}</text
        >
      {/each}
    </svg>
  </div>
  <p class="mt-1.5 flex flex-wrap gap-x-4 text-[0.72rem] text-ink-muted">
    <span>Peak {peak}{maxPlayers ? ` of ${maxPlayers}` : ''}</span>
    <span
      >Buckets of {history.bucket_s >= 3600
        ? `${Math.round(history.bucket_s / 3600)} h`
        : `${Math.round(history.bucket_s / 60)} min`}</span
    >
    {#if bands.length > 0}<span>Shaded: offline or out of contact</span>{/if}
  </p>
{/if}
