<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import type { AdminPlayer } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { formatHours } from '$lib/ui/format';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import PlatformTag from '$lib/ui/PlatformTag.svelte';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let editing = $state<number | null>(null);
  let draft = $state('');
  let busy = $state<number | null>(null);
  let problem = $state('');

  const items = $derived(data.players.ok ? data.players.data.items : []);

  function explain(error: unknown): string {
    if (error instanceof ApiError && error.status === 403) {
      return 'The request was refused: admin changes must come from this site.';
    }
    return error instanceof Error ? error.message : String(error);
  }

  async function patch(
    player: AdminPlayer,
    body: { name_override?: string | null; hidden?: boolean }
  ) {
    busy = player.id;
    problem = '';
    try {
      await api.updateAdminPlayer(player.id, body);
      editing = null;
      await invalidateAll();
    } catch (error) {
      problem = explain(error);
    } finally {
      busy = null;
    }
  }

  function startEdit(player: AdminPlayer) {
    editing = player.id;
    draft = player.name_override ?? player.game_name;
  }
</script>

<Meta title="Admin players" description="Rename or hide players, and see their platform ids." />

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Admin"
    note="Platform ids and account names are shown only here. A hidden player disappears from every public page, list and feed; their history is kept."
  >
    {#snippet heading()}Players{/snippet}
    {#snippet aside()}
      <form method="get" class="flex items-center gap-2 text-[0.8125rem]">
        <input
          type="search"
          name="q"
          value={data.q}
          placeholder="Name, account or id"
          class="field w-56"
        />
        <button type="submit" class="btn">Search</button>
      </form>
    {/snippet}
  </PageHeader>

  {#if problem}<p class="text-[0.8125rem] text-danger" role="alert">{problem}</p>{/if}

  <Card flush>
    {#if !data.players.ok}
      <div class="p-4"><ErrorNote error={data.players.error} what="the players" /></div>
    {:else if items.length === 0}
      <EmptyState message={data.q ? 'No players match.' : 'Nobody has joined yet.'} />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Platform id</th>
              <th class="num">Level</th>
              <th class="num">Played</th>
              <th>Last seen</th>
              <th><span class="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody>
            {#each items as player (player.id)}
              <tr class={player.hidden ? 'opacity-60' : ''}>
                <td>
                  {#if editing === player.id}
                    <form
                      class="flex items-center gap-2"
                      onsubmit={(event) => {
                        event.preventDefault();
                        const value = draft.trim();
                        void patch(player, {
                          name_override: value && value !== player.game_name ? value : null
                        });
                      }}
                    >
                      <input class="field w-40" maxlength="64" bind:value={draft} />
                      <button type="submit" class="btn btn-primary" disabled={busy !== null}
                        >Save</button
                      >
                      <button type="button" class="btn" onclick={() => (editing = null)}
                        >Cancel</button
                      >
                    </form>
                  {:else}
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        class="lamp {player.online ? 'text-online' : 'text-line-strong'}"
                        aria-hidden="true"
                      ></span>
                      <a
                        href="/players/{player.id}"
                        class="font-semibold text-accent hover:underline">{player.name}</a
                      >
                      <PlatformTag platform={player.platform} />
                      {#if player.hidden}<span class="chip text-warning">hidden</span>{/if}
                    </div>
                    <div class="text-[0.72rem] text-ink-muted">
                      {#if player.name_override}in game {player.game_name}{/if}
                      {#if player.account_name}
                        · account {player.account_name}{/if}
                    </div>
                  {/if}
                </td>
                <td><code class="text-xs break-all">{player.user_id}</code></td>
                <td class="num">{player.level}</td>
                <td class="num">{formatHours(player.playtime_s)}</td>
                <td><Time at={player.last_seen} mode="relative" /></td>
                <td class="num whitespace-nowrap">
                  {#if editing !== player.id}
                    <button type="button" class="btn" onclick={() => startEdit(player)}
                      >Rename</button
                    >
                    <button
                      type="button"
                      class="btn"
                      disabled={busy !== null}
                      onclick={() => patch(player, { hidden: !player.hidden })}
                      >{player.hidden ? 'Show' : 'Hide'}</button
                    >
                  {/if}
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
</div>
