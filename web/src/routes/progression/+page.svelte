<script lang="ts">
  import { browser } from '$app/environment';
  import Card from '$lib/ui/Card.svelte';
  import { clock } from '$lib/ui/clock.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import GuildLink from '$lib/ui/GuildLink.svelte';
  import LevelCurve from '$lib/ui/LevelCurve.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import {
    beatenCount,
    bossLegend,
    bossMarkersOf,
    describeClear,
    levelPoints,
    notSeenLive,
    storyLine,
    tierLine,
    towerRows
  } from '$lib/ui/progression';
  import Time from '$lib/ui/Time.svelte';
  import WorldMap from '$lib/ui/WorldMap.svelte';
  import { levels, max_level } from '$lib/world/exp.json';

  let { data } = $props();

  const board = $derived(data.progression.ok ? data.progression.data : null);
  const rows = $derived(board ? towerRows(board) : []);
  const legend = $derived(board ? bossLegend(board) : []);
  const markers = $derived(board ? bossMarkersOf(board) : []);
  const points = $derived(board ? levelPoints(board.players) : []);
  const local = $derived(browser ? clock.local : false);
  const emptyWorld = { updated_at: null, players: [], bases: [], wild: [], deaths: [] };
  const expTotals = levels.map((entry) => ({ level: entry.level, total: entry.total }));
</script>

<Meta
  title="Progression"
  description="Towers, story, technology, field bosses and guild research from the world save."
/>

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="From the world save"
    note="Who has beaten which tower, how far each player is through the story and the technology tree, the field bosses beaten and by whom, and what each guild's lab is researching, as the server's own save records it."
  >
    {#snippet heading()}Progression{/snippet}
    {#snippet aside()}
      {#if board?.saved_at}
        <p class="ticker">from the world save, <Time at={board.saved_at} mode="relative" /></p>
      {/if}
    {/snippet}
  </PageHeader>

  {#if !board}
    {#if !data.progression.ok}<ErrorNote error={data.progression.error} what="the board" />{/if}
  {:else if board.players.length === 0}
    <Card title="Towers">
      <p class="note">the world save has not listed any player's records yet.</p>
    </Card>
  {:else}
    <Card title="Towers" flush>
      {#snippet actions()}
        <span class="ticker">✓ normal · ★ hard · ×n clears</span>
      {/snippet}
      <div class="overflow-x-auto">
        <table class="data-table tower-grid">
          <thead>
            <tr>
              <th>Player</th>
              {#each board.towers as tower (tower.id)}
                <th class="tower-head" title="{tower.name}, level {tower.level}"
                  ><span>{tower.name.replace(/ Tower$/, '')}</span></th
                >
              {/each}
              <th class="num">Taken</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.index)}
              <tr>
                <td>
                  {#if row.player.player}<PlayerLink player={row.player.player} />{:else}<span
                      >{row.player.name}</span
                    >{/if}
                </td>
                {#each row.cells as cell (cell.tower.id)}
                  <td
                    class="tower-cell"
                    data-normal={cell.normal ? 'true' : undefined}
                    data-hard={cell.hard ? 'true' : undefined}
                    title="{describeClear(cell.tower, cell.normal, local)}. {describeClear(
                      cell.tower,
                      cell.hard,
                      local
                    )}"
                  >
                    {#if cell.hard}★{#if cell.hard.count > 1}×{cell.hard
                          .count}{/if}{:else if cell.normal}✓{#if cell.normal.count > 1}×{cell
                          .normal.count}{/if}{:else}·{/if}
                  </td>
                {/each}
                <td class="num">{row.cleared} of {board.towers.length}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Story">
        <ul class="flex flex-col divide-y divide-line text-[0.8125rem]" aria-label="Story stages">
          {#each board.players as player, index (index)}
            <li class="flex flex-col gap-1.5 py-2">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3">
                <span class="font-semibold">
                  {#if player.player}<PlayerLink player={player.player} />{:else}{player.name}{/if}
                </span>
                <span class="text-ink-muted">{storyLine(player.story)}</span>
              </div>
              <div
                class="progress-bar"
                role="progressbar"
                aria-label="{player.name}'s story quests"
                aria-valuemin={0}
                aria-valuemax={player.story.total}
                aria-valuenow={player.story.completed}
              >
                <span
                  style="width: {player.story.total > 0
                    ? ((100 * player.story.completed) / player.story.total).toFixed(1)
                    : 0}%"
                ></span>
              </div>
            </li>
          {/each}
        </ul>
      </Card>

      <Card title="Technology">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th class="num">Tier</th>
                <th class="num">Unlocked</th>
                <th class="num">Ancient</th>
                <th class="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {#each board.players as player, index (index)}
                <tr title={tierLine(player.technology)}>
                  <td class="whitespace-normal">
                    {#if player.player}<PlayerLink
                        player={player.player}
                      />{:else}{player.name}{/if}
                    {#if player.technology.last_unlocked}
                      <span class="block text-[0.72rem] text-ink-muted"
                        >{player.technology.last_unlocked.name}, <Time
                          at={player.technology.last_unlocked.at}
                          mode="relative"
                        /></span
                      >
                    {/if}
                  </td>
                  <td class="num">{player.technology.tier}</td>
                  <td class="num"
                    >{formatNumber(player.technology.unlocked)}
                    <span class="text-ink-faint">/ {formatNumber(player.technology.total)}</span
                    ></td
                  >
                  <td class="num"
                    >{player.technology.boss_unlocked}
                    <span class="text-ink-faint">/ {player.technology.boss_total}</span></td
                  >
                  <td class="num"
                    >{player.technology.points}{#if player.technology.boss_points > 0}
                      + {player.technology.boss_points}{/if}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    </div>

    <Card title="Field bosses" flush>
      {#snippet actions()}
        <span class="ticker">{beatenCount(board)} of {board.field_bosses.length} beaten</span>
      {/snippet}
      <WorldMap world={emptyWorld} bosses={markers} landmarks={false} label="Field bosses" />
      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[0.8125rem]"
        aria-label="Who beat them"
      >
        {#each legend as entry (entry.index)}
          <span class="inline-flex items-center gap-1.5"
            ><span
              class="inline-block size-3 rotate-45 rounded-[2px]"
              style="background: {entry.color}"
              aria-hidden="true"
            ></span>{entry.name} <span class="text-ink-muted">{entry.beaten}</span></span
          >
        {:else}
          <span class="note">nobody has beaten a field boss yet.</span>
        {/each}
        <span class="inline-flex items-center gap-1.5 text-ink-muted"
          ><span
            class="inline-block size-3 rotate-45 rounded-[2px] bg-line-strong opacity-60"
            aria-hidden="true"
          ></span>not yet</span
        >
      </div>
    </Card>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Guild research">
        {#if board.guilds.length === 0}
          <p class="note">no guild has a lab in the world save yet.</p>
        {:else}
          <ul
            class="flex flex-col divide-y divide-line text-[0.8125rem]"
            aria-label="Guild research"
          >
            {#each board.guilds as entry (entry.guild.id)}
              <li class="flex flex-col gap-1.5 py-2">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3">
                  <GuildLink guild={entry.guild} />
                  <span class="text-ink-muted">{entry.done} of {entry.total} researched</span>
                </div>
                {#if entry.current}
                  <div class="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>researching <span class="font-semibold">{entry.current.name}</span></span>
                    <span class="text-ink-muted"
                      >{Math.round(entry.current.share * 100)}% · {formatNumber(
                        Math.round(entry.current.work)
                      )} of {formatNumber(entry.current.required_work)} work</span
                    >
                  </div>
                  <div
                    class="progress-bar"
                    data-tone="ember"
                    role="progressbar"
                    aria-label="{entry.guild.name}'s current research"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(entry.current.share * 100)}
                  >
                    <span style="width: {(entry.current.share * 100).toFixed(1)}%"></span>
                  </div>
                {:else}
                  <span class="text-ink-muted">nothing under way</span>
                {/if}
                {#if entry.completed.length > 0}
                  <span class="flex flex-wrap gap-1">
                    {#each entry.completed as done (done.id)}
                      <span class="chip text-[0.66rem] tracking-normal normal-case"
                        >{done.name}</span
                      >
                    {/each}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </Card>

      <Card title="Level against playtime">
        {#snippet actions()}
          <span class="ticker">with the exp the game asks for at each tenth level</span>
        {/snippet}
        <LevelCurve {points} levelCap={max_level} exp={expTotals} />
      </Card>
    </div>

    <ul class="flex flex-col gap-1 text-[0.72rem] text-ink-muted" aria-label="How this is known">
      {#each notSeenLive as note, index (index)}
        <li>{note}</li>
      {/each}
    </ul>
  {/if}
</div>
