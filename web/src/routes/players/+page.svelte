<script lang="ts">
  import { page } from '$app/state';
  import type { LeaderboardEntry } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatDistance, formatHours, formatNumber } from '$lib/ui/format';
  import GuildLink from '$lib/ui/GuildLink.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import { withParams } from '$lib/ui/query';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const sorts = [
    { key: 'last_seen', label: 'Recent' },
    { key: 'playtime', label: 'Playtime' },
    { key: 'level', label: 'Level' },
    { key: 'name', label: 'Name' }
  ];

  const items = $derived(data.players.ok ? data.players.data.items : []);
  const boards = $derived(
    data.leaderboards.ok
      ? [
          {
            title: 'All-time playtime',
            entries: data.leaderboards.data.playtime,
            value: (entry: LeaderboardEntry) => formatHours(entry.value)
          },
          {
            title: 'Most knocked out',
            entries: data.leaderboards.data.deaths,
            value: (entry: LeaderboardEntry) => formatNumber(entry.value)
          },
          {
            title: 'Most talkative',
            entries: data.leaderboards.data.chat,
            value: (entry: LeaderboardEntry) => formatNumber(entry.value)
          },
          {
            title: 'Furthest travelled',
            entries: data.leaderboards.data.distance,
            value: (entry: LeaderboardEntry) => formatDistance(entry.value)
          }
        ].filter((board) => board.entries.length > 0)
      : []
  );
</script>

<Meta
  title="Players"
  description="Everyone who has played on the server, with their level, playtime and guild."
/>

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="The roster"
    note="Everyone who has joined since the site began keeping the log. Playtime counts from join to leave, including the session in progress."
  >
    {#snippet heading()}Players{/snippet}
    {#snippet aside()}
      <form method="get" class="flex flex-wrap items-center gap-2 text-[0.8125rem]">
        <input type="hidden" name="sort" value={data.sort} />
        <label>
          <span class="sr-only">Search players</span>
          <input type="search" name="q" value={data.q} placeholder="Name" class="field w-48" />
        </label>
        <button type="submit" class="btn">Search</button>
        {#if data.q}<a href={withParams(page.url, { q: null, cursor: null })} class="seg">Clear</a
          >{/if}
      </form>
    {/snippet}
  </PageHeader>

  <nav class="flex flex-wrap gap-1.5" aria-label="Sort players">
    {#each sorts as sort (sort.key)}
      <a
        href={withParams(page.url, { sort: sort.key, cursor: null })}
        class="seg"
        aria-current={data.sort === sort.key ? 'true' : undefined}>{sort.label}</a
      >
    {/each}
  </nav>

  <Card flush>
    {#if !data.players.ok}
      <div class="p-4"><ErrorNote error={data.players.error} what="the player list" /></div>
    {:else if items.length === 0}
      <EmptyState
        message={data.q ? 'No players match that name.' : 'Nobody has joined the server yet.'}
      />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Player</th>
              <th class="num">Level</th>
              <th>Guild</th>
              <th class="num">Playtime</th>
              <th class="num">Sessions</th>
              <th class="num">Knockouts</th>
              <th>First seen</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {#each items as player (player.id)}
              <tr>
                <td>
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="lamp {player.online ? 'text-online' : 'text-line-strong'}"
                      title={player.online ? 'Online now' : 'Offline'}
                      aria-hidden="true"
                    ></span>
                    <PlayerLink player={{ id: player.id, name: player.name }} />
                    <PlatformTag platform={player.platform} />
                  </div>
                </td>
                <td class="num">{player.level}</td>
                <td
                  >{#if player.guild}<GuildLink guild={player.guild} />{/if}</td
                >
                <td class="num">{formatHours(player.playtime_s)}</td>
                <td class="num">{formatNumber(player.sessions)}</td>
                <td class="num">{formatNumber(player.deaths)}</td>
                <td><Time at={player.first_seen} mode="date" /></td>
                <td>
                  {#if player.online}<span class="text-online">online now</span>{:else}<Time
                      at={player.last_seen}
                      mode="relative"
                    />{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="px-3 pb-3">
        <Pager nextCursor={data.players.data.next_cursor} count={items.length} label="players" />
      </div>
    {/if}
  </Card>

  {#if boards.length > 0}
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {#each boards as board (board.title)}
        <Card title={board.title}>
          <ol class="flex flex-col gap-1.5">
            {#each board.entries as entry, index (entry.player.id)}
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
</div>
