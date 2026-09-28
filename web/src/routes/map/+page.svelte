<script lang="ts">
  import { baseLabel } from '$lib/ui/activity';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import { guildColor } from '$lib/ui/map';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Time from '$lib/ui/Time.svelte';
  import WorldMap from '$lib/ui/WorldMap.svelte';
  import { formatDisplay } from '$lib/world/map';

  let { data } = $props();

  const live = useLive();
  const world = $derived(live.map ?? (data.map.ok ? data.map.data : null));
  let showWild = $state(true);
  let showDeaths = $state(true);
  let showLandmarks = $state(true);
  let focus = $state<{ x: number; y: number } | null>(null);
  let focused = $state<number | null>(null);

  const shown = $derived(
    world
      ? {
          ...world,
          wild: showWild ? world.wild : [],
          deaths: showDeaths ? world.deaths : []
        }
      : null
  );
</script>

<svelte:head>
  <title>Map · {data.siteName}</title>
</svelte:head>

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Live"
    note="Players, bases and the wild Pals around players, as the server last reported them. The map is drawn from the game's own region data; it is not the in-game map."
  >
    {#snippet heading()}The islands{/snippet}
    {#snippet aside()}
      {#if world?.updated_at}
        <p class="ticker">updated <Time at={world.updated_at} mode="relative" /></p>
      {/if}
    {/snippet}
  </PageHeader>

  {#if !world && !data.map.ok}
    <ErrorNote error={data.map.error} what="the map" />
  {:else}
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <WorldMap world={shown} landmarks={showLandmarks} {focus} highlight={focused} />
      <div class="flex flex-col gap-4">
        <Card title="Layers">
          <div class="flex flex-col gap-2 text-[0.8125rem]">
            <label class="flex items-center gap-2"
              ><input type="checkbox" bind:checked={showLandmarks} /> Eagle statues and towers</label
            >
            <label class="flex items-center gap-2"
              ><input type="checkbox" bind:checked={showWild} /> Wild Pals near players</label
            >
            <label class="flex items-center gap-2"
              ><input type="checkbox" bind:checked={showDeaths} /> Knockouts, last 24 hours</label
            >
          </div>
        </Card>
        <Card title="On the map">
          {#if (world?.players.length ?? 0) === 0}
            <p class="note">nobody is out right now.</p>
          {:else}
            <ul class="flex flex-col gap-1.5 text-[0.8125rem]">
              {#each world?.players ?? [] as player (player.id)}
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-hover"
                    onclick={() => {
                      focus = { x: player.x, y: player.y };
                      focused = player.id;
                    }}
                  >
                    <span
                      class="inline-block size-2.5 rounded-full"
                      style="background: {player.down
                        ? 'var(--color-offline)'
                        : guildColor(player.guild_id)}"
                      aria-hidden="true"
                    ></span>
                    <span class="font-semibold text-accent">{player.name}</span>
                    <span class="ml-auto text-[0.7rem] text-ink-muted"
                      >{formatDisplay(player.x, player.y)}</span
                    >
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
        <Card title="Bases">
          {#if (world?.bases.length ?? 0) === 0}
            <p class="note">no bases shown.</p>
          {:else}
            <ul class="flex flex-col gap-1.5 text-[0.8125rem]">
              {#each world?.bases ?? [] as base (base.id)}
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-hover"
                    onclick={() => {
                      focus = { x: base.x, y: base.y };
                      focused = null;
                    }}
                  >
                    <span
                      class="mt-1.5 inline-block size-2.5 shrink-0 self-start rounded-sm"
                      style="background: {guildColor(base.guild?.id)}"
                      aria-hidden="true"
                    ></span>
                    <span class="flex min-w-0 flex-col">
                      <span>{baseLabel(base)}</span>
                      {#if base.guild}<span class="text-[0.7rem] text-ink-muted"
                          >{base.guild.name}</span
                        >{/if}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      </div>
    </div>
  {/if}
</div>
