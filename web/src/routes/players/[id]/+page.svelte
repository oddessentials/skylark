<script lang="ts">
  import { page } from '$app/state';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatDistance, formatDuration, formatHours, formatNumber } from '$lib/ui/format';
  import GuildLink from '$lib/ui/GuildLink.svelte';
  import LevelChart from '$lib/ui/LevelChart.svelte';
  import { useLive } from '$lib/ui/live.svelte';
  import { guildColor, initialOf } from '$lib/ui/map';
  import Meta from '$lib/ui/Meta.svelte';
  import PalChip from '$lib/ui/PalChip.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import ProgressCard from '$lib/ui/ProgressCard.svelte';
  import { withParams } from '$lib/ui/query';
  import Time from '$lib/ui/Time.svelte';
  import WorldMap from '$lib/ui/WorldMap.svelte';
  import { formatDisplay } from '$lib/world/map';

  let { data } = $props();

  const live = useLive();
  const player = $derived(data.player.ok ? data.player.data : null);
  const liveSelf = $derived(live.online?.players.find((entry) => entry.id === player?.id) ?? null);
  const party = $derived(liveSelf?.party ?? player?.party ?? []);
  const livePosition = $derived(live.map?.players.find((entry) => entry.id === player?.id) ?? null);
  const mapWorld = $derived.by(() => {
    if (!player) return null;
    const at = livePosition ?? player.position;
    return {
      updated_at: null,
      players:
        at && player.online
          ? [
              {
                id: player.id,
                name: player.name,
                level: player.level,
                guild_id: player.guild?.id ?? null,
                x: at.x,
                y: at.y,
                down: livePosition?.down ?? false
              }
            ]
          : [],
      bases: [],
      wild: [],
      deaths: (player.recent_deaths ?? []).flatMap((death) =>
        death.x !== null && death.y !== null
          ? [{ player: { id: player.id, name: player.name }, at: death.at, x: death.x, y: death.y }]
          : []
      )
    };
  });
  const trail = $derived(data.trail?.ok ? data.trail.data : null);
  const focus = $derived.by(() => {
    const points = trail?.points ?? [];
    const last = points[points.length - 1];
    if (last) return { x: last.x, y: last.y };
    return player?.position ? { x: player.position.x, y: player.position.y } : null;
  });

  const endReasons: Record<string, string> = {
    left: 'left',
    server_offline: 'server went down',
    collector_stopped: 'collector stopped',
    collector_lost: 'contact lost',
    absent: 'vanished'
  };
</script>

{#if !player}
  {#if !data.player.ok}<ErrorNote error={data.player.error} what="this player" />{/if}
{:else}
  <Meta
    title={player.name}
    description="{player.name}: level {player.level}, {formatHours(player.playtime_s)} played."
  />
  <div class="flex flex-col gap-6">
    <header class="rise flex flex-wrap items-center gap-5">
      <span
        class="flex size-16 items-center justify-center rounded-full font-display text-3xl font-extrabold text-surface-raised shadow-[0_8px_20px_-10px_rgba(36,31,24,0.6)]"
        style="background: {guildColor(player.guild?.id)}"
        aria-hidden="true">{initialOf(player.name)}</span
      >
      <div class="flex min-w-0 flex-col gap-1">
        <p class="eyebrow flex flex-wrap items-center gap-2">
          <span class="lamp {player.online ? 'text-online' : 'text-line-strong'}"></span>
          {player.online ? 'Online now' : 'Offline'}
          <PlatformTag platform={player.platform} />
        </p>
        <h1 class="page-title">{player.name}</h1>
        <p class="text-[0.8125rem] text-ink-muted">
          Level {player.level}{#if player.guild}, of <GuildLink guild={player.guild} />{/if}
          {#if player.online && player.current_session}
            · on since <Time at={player.current_session.joined_at} mode="relative" />
          {:else}
            · last seen <Time at={player.last_seen} mode="relative" />
          {/if}
        </p>
      </div>
    </header>

    <div class="rise rise-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {#each [{ label: 'Level', value: String(player.level) }, { label: 'Played', value: formatHours(player.playtime_s) }, { label: 'Sessions', value: formatNumber(player.sessions) }, { label: 'Knockouts', value: formatNumber(player.deaths) }, { label: 'Travelled', value: player.distance_m === null ? '—' : formatDistance(player.distance_m) }, { label: 'Chat lines', value: player.chat_messages === null ? '—' : formatNumber(player.chat_messages) }] as stat (stat.label)}
        <div class="card flex flex-col gap-0.5 px-4 py-3">
          <span class="stat-label">{stat.label}</span>
          <span class="stat-value">{stat.value}</span>
        </div>
      {/each}
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div class="flex flex-col gap-6">
        {#if party.length > 0}
          <Card title="Out with them">
            <div class="flex flex-wrap gap-2">
              {#each party as pal, index (index)}
                <PalChip species={pal.species} name={pal.name} level={pal.level} />
              {/each}
            </div>
          </Card>
        {/if}

        {#if player.progress}
          <ProgressCard progress={player.progress} />
        {/if}

        <Card title="Level over time">
          <LevelChart
            history={player.level_history}
            current={player.level}
            until={player.last_seen}
          />
        </Card>

        <Card title="Sessions" flush>
          {#if !data.sessions.ok}
            <div class="p-4"><ErrorNote error={data.sessions.error} what="the sessions" /></div>
          {:else if data.sessions.data.items.length === 0}
            <p class="note p-4">no sessions yet.</p>
          {:else}
            <div class="overflow-x-auto">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Joined</th>
                    <th class="num">Length</th>
                    <th class="num">Levels</th>
                    {#if player.distance_m !== null}<th class="num">Travelled</th>{/if}
                    <th>Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.sessions.data.items as session (session.id)}
                    <tr>
                      <td>
                        {#if data.trail}
                          <a
                            href={withParams(page.url, { session: session.id })}
                            class="hover:text-accent hover:underline"
                            aria-current={trail?.session_id === session.id ? 'true' : undefined}
                            ><Time at={session.joined_at} /></a
                          >
                        {:else}
                          <Time at={session.joined_at} />
                        {/if}
                      </td>
                      <td class="num">
                        {session.duration_s === null
                          ? 'ongoing'
                          : formatDuration(session.duration_s)}
                      </td>
                      <td class="num">
                        {session.level_start ?? '?'}{session.level_end !== null &&
                        session.level_end !== session.level_start
                          ? ` → ${session.level_end}`
                          : ''}
                      </td>
                      {#if player.distance_m !== null}
                        <td class="num">{formatDistance(session.distance_m)}</td>
                      {/if}
                      <td class="text-ink-muted">
                        {session.end_reason ? endReasons[session.end_reason] : ''}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </Card>
      </div>

      <div class="flex flex-col gap-6">
        {#if data.trail}
          <Card title="Where they went" flush>
            {#snippet actions()}
              {#if trail?.session_id}<span class="ticker"
                  >{trail.points.length} points{data.session ? '' : ', latest session'}</span
                >{/if}
            {/snippet}
            <WorldMap
              world={mapWorld}
              trail={trail?.points ?? null}
              highlight={player.id}
              {focus}
              landmarks={false}
              label="{player.name}'s trail"
            />
          </Card>
        {/if}

        <Card title="Recent knockouts">
          {#if player.recent_deaths.length === 0}
            <p class="note">never knocked out. yet.</p>
          {:else}
            <ul class="flex flex-col gap-1.5 text-[0.8125rem]">
              {#each player.recent_deaths as death, index (index)}
                <li class="flex flex-wrap gap-x-3">
                  <Time at={death.at} />
                  {#if death.killer}<span>by {death.killer}</span>{/if}
                  {#if death.x !== null}<span class="text-ink-muted"
                      >at {formatDisplay(death.x, death.y)}</span
                    >{/if}
                </li>
              {/each}
            </ul>
          {/if}
        </Card>
      </div>
    </div>
  </div>
{/if}
