<script lang="ts">
  import type { PlayerProgress } from '$lib/api/types';
  import Card from './Card.svelte';
  import Stat from './Stat.svelte';
  import Time from './Time.svelte';
  import { formatNumber } from './format';

  let { progress }: { progress: PlayerProgress } = $props();

  const share = $derived(
    progress.palpedia_total > 0 ? Math.min(1, progress.palpedia / progress.palpedia_total) : 0
  );
</script>

<Card title="Progress">
  {#snippet actions()}
    <span class="ticker">from the world save, <Time at={progress.saved_at} mode="relative" /></span>
  {/snippet}
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-3">
        <span class="stat-label">Palpedia</span>
        <span class="stat-value"
          >{formatNumber(progress.palpedia)}
          <span class="stat-detail">of {formatNumber(progress.palpedia_total)}</span></span
        >
      </div>
      <div
        class="h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="Palpedia entries unlocked"
        aria-valuemin={0}
        aria-valuemax={progress.palpedia_total}
        aria-valuenow={progress.palpedia}
      >
        <div class="h-full rounded-full bg-accent" style="width: {(share * 100).toFixed(1)}%"></div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Stat
        label="Captured"
        value={formatNumber(progress.captures)}
        detail="{formatNumber(progress.species_captured)} species"
      />
      <Stat
        label="Towers"
        value="{progress.tower_bosses.length} of {progress.tower_bosses_total}"
      />
      <Stat label="Field bosses" value={formatNumber(progress.field_bosses)} />
      <Stat label="Dungeons" value={formatNumber(progress.dungeon_clears)} />
      <Stat label="Technologies" value={formatNumber(progress.technologies)} />
      <Stat label="Fast travel" value={formatNumber(progress.fast_travel_points)} />
    </div>
    {#if progress.tower_bosses.length > 0}
      <ul class="flex flex-wrap gap-1.5" aria-label="Towers taken">
        {#each progress.tower_bosses as boss (boss.id)}
          <li class="chip text-[0.7rem] tracking-normal normal-case">{boss.name}</li>
        {/each}
      </ul>
    {/if}
  </div>
</Card>
