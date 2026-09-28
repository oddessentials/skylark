<script lang="ts">
  import type { GuildPalpediaMember } from '$lib/api/types';
  import Card from './Card.svelte';
  import { formatNumber } from './format';
  import { describeTile, tilesOf, type AnyEntry, type Tile } from './palpedia';
  import PlayerLink from './PlayerLink.svelte';
  import Time from './Time.svelte';

  let {
    entries,
    unlocked,
    total,
    savedAt,
    members = null,
    owner
  }: {
    entries: AnyEntry[];
    unlocked: number;
    total: number;
    savedAt: string | null;
    members?: GuildPalpediaMember[] | null;
    owner: string;
  } = $props();

  type View = 'all' | 'caught' | 'missing';
  let view = $state<View>('all');

  const tiles = $derived(tilesOf(entries));
  const caught = $derived(tiles.filter((tile) => tile.caught));
  const missing = $derived(tiles.filter((tile) => !tile.caught));
  const shown = $derived(view === 'caught' ? caught : view === 'missing' ? missing : tiles);
  const share = $derived(total > 0 ? Math.min(1, unlocked / total) : 0);
  const views: { id: View; label: string; count: number }[] = $derived([
    { id: 'all', label: 'All', count: tiles.length },
    { id: 'caught', label: 'Caught', count: caught.length },
    { id: 'missing', label: 'Missing', count: missing.length }
  ]);

  function holderNames(tile: Tile): string[] {
    return tile.holders.flatMap((index) => {
      const member = members?.[index];
      return member ? [member.name] : [];
    });
  }
</script>

<Card title="Palpedia">
  {#snippet actions()}
    {#if savedAt}
      <span class="ticker">from the world save, <Time at={savedAt} mode="relative" /></span>
    {/if}
  {/snippet}
  {#if !savedAt}
    <p class="note">the world save has not listed the Palpedia of {owner} yet.</p>
  {:else}
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between gap-3">
          <span class="stat-label">{members ? 'Caught between them' : 'Caught'}</span>
          <span class="stat-value"
            >{formatNumber(unlocked)}
            <span class="stat-detail">of {formatNumber(total)}</span></span
          >
        </div>
        <div
          class="h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Palpedia entries unlocked"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={unlocked}
        >
          <div
            class="h-full rounded-full bg-accent"
            style="width: {(share * 100).toFixed(1)}%"
          ></div>
        </div>
      </div>

      {#if members && members.length > 0}
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]" aria-label="Members">
          {#each members as member, index (index)}
            <li class="flex items-baseline gap-1.5">
              {#if member.player}<PlayerLink player={member.player} />{:else}<span
                  >{member.name}</span
                >{/if}
              <span class="text-ink-muted">{formatNumber(member.unlocked)}</span>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="flex flex-wrap gap-1" role="group" aria-label="Show">
        {#each views as option (option.id)}
          <button
            type="button"
            class="seg"
            aria-pressed={view === option.id}
            onclick={() => (view = option.id)}>{option.label} {formatNumber(option.count)}</button
          >
        {/each}
      </div>

      {#if shown.length === 0}
        <p class="note">nothing here.</p>
      {:else}
        <ul class="palpedia-grid" aria-label="Palpedia entries">
          {#each shown as tile (tile.species)}
            {@const label = describeTile(tile, holderNames(tile))}
            <li>
              {#if tile.mapHref}
                <a
                  href={tile.mapHref}
                  class="palpedia-tile"
                  data-caught={tile.caught}
                  style="--tile: {tile.color}"
                  title={label}
                  aria-label={label}
                ></a>
              {:else}
                <span
                  class="palpedia-tile"
                  data-caught={tile.caught}
                  style="--tile: {tile.color}"
                  title={label}
                  role="img"
                  aria-label={label}
                ></span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if missing.length > 0}
        <details class="text-[0.8125rem]">
          <summary class="cursor-pointer text-ink-muted"
            >{members ? 'Nobody has caught' : 'Still missing'}: {formatNumber(
              missing.length
            )}</summary
          >
          <ul class="mt-2 flex flex-col divide-y divide-line">
            {#each missing as tile (tile.species)}
              <li class="flex flex-wrap items-baseline gap-x-3 py-1.5">
                <span class="flex items-center gap-2">
                  <span
                    class="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/15"
                    style="background: {tile.color}"
                    aria-hidden="true"
                  ></span>
                  <span class="text-ink-faint">{tile.number}</span>
                  <span class="font-semibold">{tile.name}</span>
                </span>
                <span class="text-ink-muted">{tile.how}</span>
                {#if tile.mapHref}
                  <a href={tile.mapHref} class="ml-auto text-accent hover:underline">on the map</a>
                {/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  {/if}
</Card>
