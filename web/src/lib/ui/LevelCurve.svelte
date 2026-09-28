<script lang="ts">
  import { describePoint, playerColor, type LevelPoint } from './progression';
  import { formatNumber } from './format';

  let {
    points,
    levelCap,
    exp
  }: { points: LevelPoint[]; levelCap: number; exp: { level: number; total: number }[] } = $props();

  let width = $state(560);
  const height = 240;
  const padLeft = 64;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 28;

  const maxHours = $derived(Math.max(1, ...points.map((point) => point.hours)) * 1.08);
  const topLevel = $derived(
    Math.min(
      levelCap,
      Math.max(20, Math.ceil((Math.max(0, ...points.map((point) => point.level)) + 5) / 10) * 10)
    )
  );
  const plotWidth = $derived(width - padLeft - padRight);
  const plotHeight = height - padTop - padBottom;
  const ticks = $derived(
    Array.from({ length: Math.floor(topLevel / 10) }, (_, index) => (index + 1) * 10)
  );
  const totals = $derived(new Map(exp.map((entry) => [entry.level, entry.total])));

  function xOf(hours: number): number {
    return padLeft + (hours / maxHours) * plotWidth;
  }

  function yOf(level: number): number {
    return padTop + plotHeight - (level / topLevel) * plotHeight;
  }

  function compact(value: number | undefined): string {
    if (value === undefined) return '';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M exp`;
    if (value >= 1000) return `${Math.round(value / 1000)}k exp`;
    return `${value} exp`;
  }

  const hourTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((share) => share * maxHours));
</script>

{#if points.length === 0}
  <p class="note">no player with both a save and playtime yet.</p>
{:else}
  <div bind:clientWidth={width}>
    <svg
      viewBox="0 0 {width} {height}"
      {height}
      class="block w-full font-sans text-ink-muted"
      role="img"
      aria-label="Level against hours played for {points.length} players"
    >
      {#each ticks as tick (tick)}
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={yOf(tick)}
          y2={yOf(tick)}
          stroke="var(--color-line)"
        />
        <text x={padLeft - 8} y={yOf(tick) + 3} text-anchor="end" font-size="10" fill="currentColor"
          >{tick}</text
        >
        <text
          x={padLeft - 8}
          y={yOf(tick) + 13}
          text-anchor="end"
          font-size="8"
          fill="currentColor"
          opacity="0.7">{compact(totals.get(tick))}</text
        >
      {/each}
      {#each hourTicks as tick (tick)}
        <text x={xOf(tick)} y={height - 8} text-anchor="middle" font-size="10" fill="currentColor"
          >{formatNumber(Math.round(tick))} h</text
        >
      {/each}
      {#each points as point (point.index)}
        <g class="level-point" role="presentation">
          <circle
            cx={xOf(point.hours)}
            cy={yOf(point.level)}
            r="5"
            fill={playerColor(point.index)}
            stroke="var(--color-surface-raised)"
            stroke-width="1.5"
          >
            <title>{describePoint(point)}</title>
          </circle>
          <text
            x={xOf(point.hours) + 8}
            y={yOf(point.level) + 3}
            font-size="10"
            fill="var(--color-ink)">{point.name}</text
          >
        </g>
      {/each}
    </svg>
  </div>
{/if}
