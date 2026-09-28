<script lang="ts">
  import { baseLabel } from '$lib/ui/activity';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { guildColor } from '$lib/ui/map';
  import Meta from '$lib/ui/Meta.svelte';
  import PalChip from '$lib/ui/PalChip.svelte';
  import PlayerLink from '$lib/ui/PlayerLink.svelte';
  import Time from '$lib/ui/Time.svelte';
  import WorldMap from '$lib/ui/WorldMap.svelte';
  import { formatDisplay } from '$lib/world/map';

  let { data } = $props();

  const guild = $derived(data.guild.ok ? data.guild.data : null);
  const roleLabels: Record<string, string> = {
    guild_master: 'Guild master',
    sub_master: 'Sub-master',
    member: 'Member',
    guest: 'Guest',
    none: ''
  };
  const roster = $derived(guild?.roster ?? []);
  const world = $derived(
    guild ? { updated_at: null, players: [], bases: guild.bases, wild: [], deaths: [] } : null
  );
</script>

{#if !guild}
  {#if !data.guild.ok}<ErrorNote error={data.guild.error} what="this guild" />{/if}
{:else}
  <Meta title={guild.name} description="{guild.name}: members and bases." />
  <div class="flex flex-col gap-6">
    <header class="rise flex items-center gap-4">
      <span
        class="inline-block size-5 rounded"
        style="background: {guildColor(guild.id)}"
        aria-hidden="true"
      ></span>
      <div class="flex flex-col gap-1">
        <p class="eyebrow">Guild</p>
        <h1 class="page-title">{guild.name}</h1>
        <p class="text-[0.8125rem] text-ink-muted">
          First seen <Time at={guild.first_seen} mode="date" />, last seen
          <Time at={guild.last_seen} mode="relative" />{#if guild.base_camp_level !== null}&nbsp;·
            base camp level {guild.base_camp_level}{/if}
        </p>
      </div>
    </header>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Members" flush>
        {#snippet actions()}
          {#if guild.roster_saved_at}<span class="ticker"
              >roles from the world save, <Time at={guild.roster_saved_at} mode="relative" /></span
            >{/if}
        {/snippet}
        {#if roster.length > 0}
          <table class="data-table">
            <thead>
              <tr><th>Player</th><th>Role</th><th class="num">Level</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {#each roster as entry, index (index)}
                <tr>
                  <td>
                    <span class="flex items-center gap-2">
                      <span
                        class="lamp {entry.online ? 'text-online' : 'text-line-strong'}"
                        aria-hidden="true"
                      ></span>
                      {#if entry.player}<PlayerLink player={entry.player} />{:else}<span
                          >{entry.name}</span
                        >{/if}
                    </span>
                  </td>
                  <td>{roleLabels[entry.role] ?? ''}</td>
                  <td class="num">{entry.level ?? '—'}</td>
                  <td>
                    {#if entry.online}<span class="text-online">online now</span
                      >{:else if entry.last_online_at}<Time
                        at={entry.last_online_at}
                        mode="relative"
                      />{:else}—{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <table class="data-table">
            <thead>
              <tr
                ><th>Player</th><th class="num">Level</th><th>Member since</th><th>Last seen</th
                ></tr
              >
            </thead>
            <tbody>
              {#each guild.members as member (member.player.id)}
                <tr>
                  <td>
                    <span class="flex items-center gap-2">
                      <span
                        class="lamp {member.online ? 'text-online' : 'text-line-strong'}"
                        aria-hidden="true"
                      ></span>
                      <PlayerLink player={member.player} />
                    </span>
                  </td>
                  <td class="num">{member.level}</td>
                  <td><Time at={member.since} mode="date" /></td>
                  <td>
                    {#if member.online}<span class="text-online">online now</span>{:else}<Time
                        at={member.last_seen}
                        mode="relative"
                      />{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </Card>

      {#if guild.bases.length > 0}
        <Card title="Bases" flush>
          <WorldMap {world} compact landmarks={false} label="{guild.name}'s bases" />
          <ul class="flex flex-col divide-y divide-line px-5 py-2 text-[0.8125rem]">
            {#each guild.bases as base (base.id)}
              <li class="flex flex-wrap items-baseline gap-x-3 py-2">
                <span class="font-semibold">{baseLabel(base)}</span>
                <span class="text-ink-muted">at {formatDisplay(base.x, base.y)}</span>
                <span class="ml-auto text-[0.72rem] text-ink-muted"
                  >{base.workers} workers{#if base.workers_seen_at}, seen <Time
                      at={base.workers_seen_at}
                      mode="relative"
                    />{/if}</span
                >
                {#if base.worker_pals && base.worker_pals.length > 0}
                  <span class="flex basis-full flex-wrap gap-1.5 pt-1">
                    {#each base.worker_pals as pal, index (index)}
                      <PalChip
                        species={pal.species}
                        name={pal.name}
                        level={pal.level}
                        alpha={pal.alpha}
                      />
                    {/each}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </Card>
      {/if}
    </div>
  </div>
{/if}
