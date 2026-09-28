<script lang="ts">
  import { page } from '$app/state';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatHours, formatNumber } from '$lib/ui/format';
  import { useLive } from '$lib/ui/live.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import PlayerCountChart from '$lib/ui/PlayerCountChart.svelte';
  import { withParams } from '$lib/ui/query';
  import Time from '$lib/ui/Time.svelte';
  import { realMinutesPerDay, speedsOf } from '$lib/world/clock';

  let { data } = $props();

  const live = useLive();
  const status = $derived(live.status ?? data.status);
  const world = $derived(data.world.ok ? data.world.data : null);
  const settings = $derived(world?.settings ?? null);
  const dayLength = $derived(
    settings
      ? realMinutesPerDay(speedsOf(settings.day_time_speed_rate, settings.night_time_speed_rate))
      : null
  );

  const yesNo = (value: boolean | null) => (value === null ? '—' : value ? 'Yes' : 'No');
  const rate = (value: number | null) => (value === null ? '—' : `${formatNumber(value)}×`);

  const layers = $derived(status?.collector.layers ?? null);
  const capabilities = $derived(
    layers
      ? [
          { on: layers.rest, name: 'Server status', detail: 'online state, players, frame rate' },
          {
            on: layers.gamedata,
            name: 'The world',
            detail: 'positions, Pals, bases, knockouts, the in-game clock'
          },
          { on: layers.logs, name: 'The log', detail: 'joins and leaves to the second, chat' },
          { on: layers.saves, name: 'Save files', detail: 'offline progress and records' },
          { on: layers.mod, name: 'Server mod', detail: 'captures, bosses, causes of knockouts' }
        ]
      : []
  );
</script>

<Meta title="World" description="The world settings, history and totals of the server." />

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Palpagos Islands"
    note="The server's own settings, as the collector read them, and everything counted since the site began keeping the log."
  >
    {#snippet heading()}{world?.name ?? 'The world'}{/snippet}
    {#snippet aside()}
      {#if world?.tracking_since}
        <p class="ticker">keeping the log since <Time at={world.tracking_since} mode="date" /></p>
      {/if}
    {/snippet}
  </PageHeader>

  {#if !world && !data.world.ok}
    <ErrorNote error={data.world.error} what="the world" />
  {/if}

  {#if world}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {#each [{ label: 'Players', value: formatNumber(world.totals.players) }, { label: 'Guilds', value: formatNumber(world.totals.guilds) }, { label: 'Bases', value: world.totals.bases === null ? '—' : formatNumber(world.totals.bases) }, { label: 'Sessions', value: formatNumber(world.totals.sessions) }, { label: 'Played', value: formatHours(world.totals.playtime_s) }, { label: 'Level-ups', value: formatNumber(world.totals.level_ups) }, { label: 'Knockouts', value: formatNumber(world.totals.deaths) }] as stat (stat.label)}
        <div class="card flex flex-col gap-0.5 px-4 py-3">
          <span class="stat-label">{stat.label}</span>
          <span class="stat-value">{stat.value}</span>
        </div>
      {/each}
    </div>
  {/if}

  <Card title="Players over time">
    {#snippet actions()}
      {#each ['24h', '7d', '30d'] as range (range)}
        <a
          href={withParams(page.url, { range })}
          class="seg"
          aria-current={data.range === range ? 'true' : undefined}>{range}</a
        >
      {/each}
    {/snippet}
    {#if data.history.ok}
      <PlayerCountChart history={data.history.data} maxPlayers={settings?.max_players ?? null} />
    {:else}
      <ErrorNote error={data.history.error} what="the history" />
    {/if}
  </Card>

  <div class="grid gap-6 lg:grid-cols-2">
    <Card title="World settings">
      {#if settings}
        <dl class="charfile">
          <dt>Experience</dt>
          <dd>{rate(settings.exp_rate)}</dd>
          <dt>Capture rate</dt>
          <dd>{rate(settings.pal_capture_rate)}</dd>
          <dt>On a knockout</dt>
          <dd>{settings.death_penalty ?? '—'}</dd>
          <dt>Player versus player</dt>
          <dd>{yesNo(settings.is_pvp)}</dd>
          <dt>Hardcore</dt>
          <dd>{yesNo(settings.is_hardcore)}</dd>
          <dt>Players at once</dt>
          <dd>{settings.max_players ?? '—'}</dd>
          <dt>Guild size</dt>
          <dd>{settings.guild_player_max_num ?? '—'}</dd>
          <dt>Bases per guild</dt>
          <dd>{settings.base_camp_max_num_in_guild ?? '—'}</dd>
          <dt>Day and night speed</dt>
          <dd>
            {rate(settings.day_time_speed_rate)} and {rate(
              settings.night_time_speed_rate
            )}{dayLength ? `, a full day takes ${Math.round(dayLength)} real minutes` : ''}
          </dd>
        </dl>
      {:else}
        <p class="note">the collector has not reported the settings yet.</p>
      {/if}
    </Card>

    <Card title="What this site can see">
      {#if capabilities.length === 0}
        <p class="note">no collector has reported yet.</p>
      {:else}
        <ul class="flex flex-col gap-2.5 text-[0.8125rem]">
          {#each capabilities as capability (capability.name)}
            <li class="flex gap-3">
              <span
                class="lamp mt-1.5 {capability.on ? 'text-online' : 'text-line-strong'}"
                aria-hidden="true"
              ></span>
              <div>
                <p class="font-semibold {capability.on ? '' : 'text-ink-muted'}">
                  {capability.name}{capability.on ? '' : ', not read'}
                </p>
                <p class="text-[0.72rem] text-ink-muted">{capability.detail}</p>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  </div>
</div>
