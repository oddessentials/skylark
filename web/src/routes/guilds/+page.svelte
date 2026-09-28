<script lang="ts">
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatNumber } from '$lib/ui/format';
  import { guildColor } from '$lib/ui/map';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const guilds = $derived(data.guilds.ok ? data.guilds.data.items : []);
</script>

<Meta title="Guilds" description="The guilds on the server, their members and their bases." />

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Together"
    note="Guilds with at least one member, as the server reports them. A player starts in a guild of their own until they join someone else's."
  >
    {#snippet heading()}Guilds{/snippet}
  </PageHeader>

  {#if !data.guilds.ok}
    <ErrorNote error={data.guilds.error} what="the guilds" />
  {:else if guilds.length === 0}
    <EmptyState message="No guilds have been seen yet." />
  {:else}
    <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {#each guilds as guild, index (guild.id)}
        <a
          href="/guilds/{encodeURIComponent(guild.id)}"
          class="card rise group flex flex-col gap-3 p-5 transition-transform hover:-translate-y-0.5"
          style="animation-delay: {Math.min(index, 8) * 40}ms"
        >
          <div class="flex items-center gap-3">
            <span
              class="inline-block size-3.5 rounded-sm"
              style="background: {guildColor(guild.id)}"
              aria-hidden="true"
            ></span>
            <h2 class="font-display text-xl font-bold text-ink group-hover:text-accent">
              {guild.name}
            </h2>
          </div>
          <dl class="grid grid-cols-3 gap-2">
            <div>
              <dt class="stat-label">Members</dt>
              <dd class="stat-value">{formatNumber(guild.members)}</dd>
            </div>
            <div>
              <dt class="stat-label">Online</dt>
              <dd class="stat-value {guild.online > 0 ? 'text-online' : ''}">
                {formatNumber(guild.online)}
              </dd>
            </div>
            {#if guild.bases !== null}
              <div>
                <dt class="stat-label">Bases</dt>
                <dd class="stat-value">{formatNumber(guild.bases)}</dd>
              </div>
            {/if}
          </dl>
          <p class="text-[0.72rem] text-ink-muted">
            {#if guild.top_level !== null}Top level {guild.top_level} ·
            {/if}seen since <Time at={guild.first_seen} mode="date" />
          </p>
        </a>
      {/each}
    </div>
  {/if}
</div>
