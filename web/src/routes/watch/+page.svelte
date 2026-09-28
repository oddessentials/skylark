<script lang="ts">
  import { page } from '$app/state';
  import { formatNumber } from '$lib/ui/format';
  import { useLive } from '$lib/ui/live.svelte';
  import { guildColor, initialOf } from '$lib/ui/map';
  import SunDial from '$lib/ui/SunDial.svelte';

  let { data } = $props();

  const live = useLive();
  const status = $derived(live.status ?? data.status);
  const online = $derived(live.online ?? (data.online.ok ? data.online.data : null));
  const players = $derived(online?.players ?? []);
  const params = $derived(page.url.searchParams);
  const shown = $derived(new Set((params.get('show') ?? 'clock,players').split(',')));
  const size = $derived(Math.min(480, Math.max(120, Number(params.get('size')) || 220)));
  const limit = $derived(Math.min(32, Math.max(1, Number(params.get('limit')) || 10)));
  const row = $derived(params.get('layout') === 'row');
  const solid = $derived(params.has('solid'));
  const headline = $derived(
    players.length === 0
      ? 'Nobody out right now'
      : players.length === 1
        ? 'One tamer out'
        : `${formatNumber(players.length)} tamers out`
  );
</script>

<svelte:head>
  <title>Watch · {data.siteName}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main
  class="watch"
  data-row={row ? 'true' : undefined}
  data-solid={solid ? 'true' : undefined}
  style="--watch-dial: {size}px"
>
  {#if shown.has('clock')}
    <div class="watch-dial"><SunDial {status} /></div>
  {/if}
  {#if shown.has('players')}
    <section class="watch-card" aria-label="Who is on">
      <p class="watch-headline">{headline}</p>
      {#if players.length > 0}
        <ul class="watch-players">
          {#each players.slice(0, limit) as player (player.id)}
            <li>
              <span
                class="watch-initial"
                style="background: {guildColor(player.guild?.id)}"
                aria-hidden="true">{initialOf(player.name)}</span
              >
              <span class="watch-name">{player.name}</span>
              <span class="watch-level">Lv {player.level}</span>
            </li>
          {/each}
        </ul>
        {#if players.length > limit}
          <p class="watch-more">and {formatNumber(players.length - limit)} more</p>
        {/if}
      {/if}
    </section>
  {/if}
</main>
