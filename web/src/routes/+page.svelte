<script lang="ts">
  import type { LeaderboardEntry, OnlinePlayer } from '$lib/api/types';
  import { mergeActivity } from '$lib/ui/activity';
  import ActivityLine from '$lib/ui/ActivityLine.svelte';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatHours, formatNumber } from '$lib/ui/format';
  import GuildLink from '$lib/ui/GuildLink.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import { guildColor, initialOf } from '$lib/ui/map';
  import PalChip from '$lib/ui/PalChip.svelte';
  import PlayerCountChart from '$lib/ui/PlayerCountChart.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import SunDial from '$lib/ui/SunDial.svelte';
  import Time from '$lib/ui/Time.svelte';
  import WorldMap from '$lib/ui/WorldMap.svelte';
  import { worldClock } from '$lib/ui/worldclock.svelte';

  let { data } = $props();

  const live = useLive();
  const status = $derived(live.status ?? data.status);
  const online = $derived(live.online ?? (data.online.ok ? data.online.data : null));
  const map = $derived(live.map ?? (data.map?.ok ? data.map.data : null));
  const activity = $derived(
    mergeActivity(live.activity, data.activity.ok ? data.activity.data.items : []).slice(0, 14)
  );
  const reading = $derived(worldClock.reading(status));
  const players = $derived(online?.players ?? []);

  const headline = $derived.by(() => {
    if (!status || status.state === 'unknown') return 'Out of contact';
    if (status.state === 'offline') return 'The server is resting';
    if (players.length === 0) return 'The islands are quiet';
    if (players.length === 1) return 'One tamer out in the world';
    return `${formatNumber(players.length)} tamers out in the world`;
  });

  function health(player: OnlinePlayer): number | null {
    if (player.hp === null || player.max_hp === null || player.max_hp <= 0) return null;
    return Math.max(0, Math.min(1, player.hp / player.max_hp));
  }

  const boards = $derived(
    data.leaderboards.ok
      ? [
          {
            title: 'Most played this week',
            entries: data.leaderboards.data.playtime_week,
            value: (entry: LeaderboardEntry) => formatHours(entry.value)
          },
          {
            title: 'Highest level',
            entries: data.leaderboards.data.level,
            value: (entry: LeaderboardEntry) => `Lv ${entry.value}`
          },
          {
            title: 'Furthest travelled',
            entries: data.leaderboards.data.distance,
            value: (entry: LeaderboardEntry) =>
              entry.value >= 1000
                ? `${(entry.value / 1000).toFixed(1)} km`
                : `${Math.round(entry.value)} m`
          }
        ].filter((board) => board.entries.length > 0)
      : []
  );
</script>

<div class="flex flex-col gap-8">
  <header class="rise flex flex-col gap-2">
    <p class="eyebrow">
      {status?.server.name ?? data.siteName}{reading ? ` · day ${formatNumber(reading.day)}` : ''}
    </p>
    <h1 class="hero-title">{headline}</h1>
    {#if status?.server.description}
      <p class="max-w-2xl text-[0.8125rem] text-ink-muted">{status.server.description}</p>
    {/if}
  </header>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <div class="flex flex-col gap-6">
      <section id="clock" class="card rise rise-2 flex flex-col items-center gap-2 p-5">
        <SunDial {status} />
      </section>

      <Card title="Out in the world" description={players.length === 0 ? 'nobody right now' : ''}>
        {#if !online && !data.online.ok}
          <ErrorNote error={data.online.error} what="who is online" />
        {:else if players.length === 0}
          <p class="note">
            {status?.state === 'online'
              ? 'the fields are empty. someone will wander in.'
              : 'no one can be out while the server is down.'}
          </p>
        {:else}
          <ul class="flex flex-col divide-y divide-line">
            {#each players as player (player.id)}
              {@const hp = health(player)}
              <li class="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-extrabold text-surface-raised"
                  style="background: {guildColor(player.guild?.id)}"
                  aria-hidden="true">{initialOf(player.name)}</span
                >
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <p class="flex flex-wrap items-baseline gap-x-2">
                    <PlayerLink player={{ id: player.id, name: player.name }} />
                    <span class="text-[0.75rem] text-ink-muted">Lv {player.level}</span>
                    {#if player.guild}<span class="text-[0.75rem]"
                        ><GuildLink guild={player.guild} /></span
                      >{/if}
                    {#if player.down}<span class="chip text-offline">knocked out</span>{/if}
                  </p>
                  <p class="flex items-center gap-3 text-[0.7rem] text-ink-muted">
                    <span>on since <Time at={player.joined_at} mode="relative" /></span>
                    {#if hp !== null}
                      <span class="flex items-center gap-1.5" title="Health">
                        <span class="progress-track w-16"
                          ><span
                            class="progress-fill"
                            style="width: {Math.round(hp * 100)}%; background: {hp < 0.3
                              ? 'var(--color-offline)'
                              : 'var(--color-grass-deep)'}"
                          ></span></span
                        >
                      </span>
                    {/if}
                  </p>
                  {#if player.party.length > 0}
                    <div class="flex flex-wrap gap-1.5 pt-0.5">
                      {#each player.party as pal, index (index)}
                        <PalChip species={pal.species} name={pal.name} level={pal.level} />
                      {/each}
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>
    </div>

    <div class="flex flex-col gap-6">
      {#if data.map}
        <Card title="The islands now" flush>
          {#snippet actions()}
            <a href="/map" class="btn">Open the map</a>
          {/snippet}
          {#if map}
            <WorldMap world={map} compact landmarks={false} label="Live map" />
          {:else if !data.map.ok}
            <div class="p-5"><ErrorNote error={data.map.error} what="the map" /></div>
          {/if}
        </Card>
      {/if}

      <Card title="Latest">
        {#snippet actions()}
          <a href="/activity" class="btn">Everything</a>
        {/snippet}
        {#if activity.length === 0}
          {#if !data.activity.ok}
            <ErrorNote error={data.activity.error} what="the activity feed" />
          {:else}
            <p class="note">nothing has happened yet.</p>
          {/if}
        {:else}
          <ul class="spine flex flex-col">
            {#each activity as item (item.id)}
              <ActivityLine {item} />
            {/each}
          </ul>
        {/if}
      </Card>
    </div>
  </div>

  {#if boards.length > 0}
    <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
      {#each boards as board (board.title)}
        <Card title={board.title}>
          <ol class="flex flex-col gap-1.5">
            {#each board.entries.slice(0, 5) as entry, index (entry.player.id)}
              <li class="flex items-baseline gap-2 text-[0.8125rem]">
                <span class="w-4 text-right text-ink-faint">{index + 1}</span>
                <PlayerLink player={entry.player} />
                <span class="ml-auto text-ink-muted tabular-nums">{board.value(entry)}</span>
              </li>
            {/each}
          </ol>
        </Card>
      {/each}
    </div>
  {/if}

  <Card title="The last day">
    {#snippet actions()}
      <a href="/world" class="btn">Server history</a>
    {/snippet}
    {#if data.history.ok}
      <PlayerCountChart history={data.history.data} maxPlayers={status?.players.max ?? null} />
    {:else}
      <ErrorNote error={data.history.error} what="the server history" />
    {/if}
  </Card>
</div>
