<script lang="ts">
  import { browser } from '$app/environment';
  import type { LevelPoint } from '$lib/api/types';
  import { clock } from './clock.svelte';
  import { parseInstant } from './format';

  let { history, current, until }: { history: LevelPoint[]; current: number; until: string } =
    $props();

  let width = $state(560);
  const height = 130;
  const padLeft = 26;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 22;

  const points = $derived(
    history
      .map((point) => ({ level: point.level, ms: parseInstant(point.at) ?? 0 }))
      .filter((point) => point.ms > 0)
  );
  const endMs = $derived(parseInstant(until) ?? Date.now());
  const first = $derived(points[0]?.ms ?? endMs);
  const span = $derived(Math.max(1, endMs - first));
  const low = $derived(Math.max(0, (points[0]?.level ?? current) - 2));
  const high = $derived(Math.max(current, low + 1));
  const plotWidth = $derived(width - padLeft - padRight);
  const plotHeight = height - padTop - padBottom;

  function xOf(ms: number): number {
    return padLeft + ((ms - first) / span) * plotWidth;
  }

  function yOf(level: number): number {
    return padTop + plotHeight - ((level - low) / (high - low)) * plotHeight;
  }

  const path = $derived.by(() => {
    if (points.length === 0) return '';
    const parts = [`M${xOf(first).toFixed(1)},${yOf(points[0]!.level - 1).toFixed(1)}`];
    for (const point of points) {
      parts.push(`L${xOf(point.ms).toFixed(1)},${yOf(point.level - 1).toFixed(1)}`);
      parts.push(`L${xOf(point.ms).toFixed(1)},${yOf(point.level).toFixed(1)}`);
    }
    parts.push(`L${xOf(endMs).toFixed(1)},${yOf(current).toFixed(1)}`);
    return parts.join(' ');
  });

  const local = $derived(browser ? clock.local : false);
  const labels = $derived.by(() => {
    const format = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: local ? undefined : 'UTC'
    });
    return { start: format.format(new Date(first)), end: format.format(new Date(endMs)) };
  });
</script>

{#if points.length === 0}
  <p class="note">No level-ups recorded yet.</p>
{:else}
  <div bind:clientWidth={width}>
    <svg
      viewBox="0 0 {width} {height}"
      {height}
      class="block w-full font-sans text-ink-muted"
      role="img"
      aria-label="Level over time, from level {points[0]!.level - 1} to {current}"
    >
      {#each [low, Math.round((low + high) / 2), high] as tick (tick)}
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
        d={path}
        fill="none"
        stroke="var(--color-grass-deep)"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <text x={padLeft} y={height - 6} font-size="10" fill="currentColor">{labels.start}</text>
      <text x={width - padRight} y={height - 6} text-anchor="end" font-size="10" fill="currentColor"
        >{labels.end}</text
      >
    </svg>
  </div>
{/if}
