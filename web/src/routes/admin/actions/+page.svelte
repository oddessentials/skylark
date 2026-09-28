<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import type { Action, ActionCreate, ActionKind } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  const kinds: { kind: ActionKind; label: string; hint: string }[] = [
    { kind: 'announce', label: 'Announce', hint: 'Shows the message to everyone in game.' },
    { kind: 'save', label: 'Save the world', hint: 'Asks the server to save right away.' },
    {
      kind: 'shutdown',
      label: 'Shut down',
      hint: 'Shows the message, counts down, saves and stops the server. Start it again from your host.'
    },
    { kind: 'kick', label: 'Kick', hint: 'Removes a player from the world for now.' },
    { kind: 'ban', label: 'Ban', hint: 'Removes a player and keeps them out.' },
    { kind: 'unban', label: 'Unban', hint: 'Lets a banned player back in.' }
  ];
  const waits = [60, 300, 600, 900];

  let kind = $state<ActionKind>('announce');
  let text = $state('');
  let playerId = $state<number | null>(null);
  let userId = $state('');
  let waittime = $state(300);
  let delayMinutes = $state(0);
  let busy = $state(false);
  let problem = $state('');
  let notice = $state('');
  let cancelling = $state<number | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  const items = $derived(data.actions.ok ? data.actions.data.items : []);
  const players = $derived(data.players.ok ? data.players.data.items : []);
  const targeted = $derived(kind === 'kick' || kind === 'ban' || kind === 'unban');
  const needsMessage = $derived(kind === 'announce');
  const takesMessage = $derived(kind !== 'save' && kind !== 'unban');
  const pending = $derived(items.some((item) => item.state === 'queued' || item.state === 'sent'));

  onMount(() => {
    timer = setInterval(() => {
      if (pending && !busy && cancelling === null) void invalidateAll();
    }, 5_000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function explain(error: unknown): string {
    if (error instanceof ApiError && error.status === 403) {
      return 'The request was refused: admin changes must come from this site.';
    }
    if (error instanceof ApiError && error.status === 401) {
      return 'Your admin session has ended. Log in again.';
    }
    return error instanceof Error ? error.message : String(error);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    problem = '';
    notice = '';
    const body: ActionCreate = { kind };
    if (takesMessage && text.trim()) body.message = text.trim();
    if (needsMessage && !body.message) {
      problem = 'Write the message first.';
      return;
    }
    if (targeted) {
      if (playerId !== null) body.player_id = playerId;
      else if (userId.trim()) body.user_id = userId.trim();
      else {
        problem = 'Pick a player or paste a user id.';
        return;
      }
    }
    if (kind === 'shutdown') body.waittime_s = waittime;
    if (delayMinutes > 0) body.delay_s = Math.round(delayMinutes * 60);
    busy = true;
    try {
      await api.createAction(body);
      notice = 'Queued. The collector picks it up with its next batch, within seconds.';
      text = '';
      await invalidateAll();
    } catch (error) {
      problem = explain(error);
    } finally {
      busy = false;
    }
  }

  async function cancel(item: Action) {
    cancelling = item.id;
    problem = '';
    try {
      await api.cancelAction(item.id);
      await invalidateAll();
    } catch (error) {
      problem = explain(error);
    } finally {
      cancelling = null;
    }
  }

  const stateTone: Record<Action['state'], string> = {
    queued: 'text-warning',
    sent: 'text-info',
    done: 'text-online',
    failed: 'text-offline',
    expired: 'text-offline',
    cancelled: 'text-ink-muted'
  };
  const labels: Record<ActionKind, string> = {
    announce: 'Announce',
    save: 'Save',
    shutdown: 'Shut down',
    kick: 'Kick',
    ban: 'Ban',
    unban: 'Unban'
  };
</script>

<Meta title="Server actions" description="Announce, save, shut down, kick or ban from the site." />

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Admin"
    note="The site never talks to the game server directly. It hands each action to the collector, which carries it out through the server's REST API and reports back."
  >
    {#snippet heading()}Server actions{/snippet}
  </PageHeader>

  <Card title="New action">
    <form class="flex flex-col gap-4 text-[0.8125rem]" onsubmit={submit}>
      <div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Action">
        {#each kinds as option (option.kind)}
          <button
            type="button"
            class="seg"
            role="radio"
            aria-checked={kind === option.kind}
            aria-current={kind === option.kind ? 'true' : undefined}
            onclick={() => (kind = option.kind)}>{option.label}</button
          >
        {/each}
      </div>
      <p class="note">{kinds.find((option) => option.kind === kind)?.hint}</p>

      {#if targeted}
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="label">Player</span>
            <select
              class="field"
              value={playerId ?? ''}
              onchange={(event) => {
                const value = event.currentTarget.value;
                playerId = value ? Number(value) : null;
              }}
            >
              <option value="">Choose a player</option>
              {#each players as player (player.id)}
                <option value={player.id}
                  >{player.name}{player.online ? ' (online)' : ''} · {player.user_id}</option
                >
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="label">Or a user id</span>
            <input
              class="field"
              placeholder="steam_7656..."
              bind:value={userId}
              disabled={playerId !== null}
            />
          </label>
        </div>
      {/if}

      {#if takesMessage}
        <label class="flex flex-col gap-1.5">
          <span class="label">{needsMessage ? 'Message' : 'Message (optional)'}</span>
          <input
            class="field"
            maxlength="200"
            bind:value={text}
            placeholder={kind === 'shutdown'
              ? 'Restarting for the patch, back in five'
              : 'Tower raid at the eagle statue in ten minutes'}
          />
        </label>
      {/if}

      {#if kind === 'shutdown'}
        <div class="flex flex-wrap items-center gap-1">
          <span class="label mr-2">Count down</span>
          {#each waits as seconds (seconds)}
            <button
              type="button"
              class="seg"
              aria-current={waittime === seconds ? 'true' : undefined}
              onclick={() => (waittime = seconds)}
              >{seconds < 60 ? `${seconds} s` : `${seconds / 60} min`}</button
            >
          {/each}
        </div>
      {/if}

      <label class="flex items-center gap-2">
        <span class="label">Start in</span>
        <input type="number" class="field w-24" min="0" max="10080" bind:value={delayMinutes} />
        <span class="text-ink-muted">minutes (0 for now)</span>
      </label>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="btn {kind === 'ban' || kind === 'shutdown' ? 'btn-danger' : 'btn-primary'}"
          disabled={busy}>{labels[kind]}</button
        >
        {#if problem}<span class="text-danger" role="alert">{problem}</span>{/if}
        {#if notice}<span role="status">{notice}</span>{/if}
      </div>
    </form>
  </Card>

  <Card title="Recent actions" flush>
    {#if !data.actions.ok}
      <div class="p-4"><ErrorNote error={data.actions.error} what="the actions" /></div>
    {:else if items.length === 0}
      <EmptyState message="No actions yet." />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr
              ><th>Created</th><th>Action</th><th>Details</th><th>State</th><th
                ><span class="sr-only">Cancel</span></th
              ></tr
            >
          </thead>
          <tbody>
            {#each items as item (item.id)}
              <tr>
                <td><Time at={item.created_at} mode="relative" /></td>
                <td>{labels[item.kind]}</td>
                <td class="max-w-md">
                  {#if item.player}<span class="font-semibold">{item.player.name}</span
                    >{:else if item.user_id}<code class="text-xs">{item.user_id}</code>{/if}
                  {#if item.message}<span class="text-ink-muted"> “{item.message}”</span>{/if}
                  {#if item.waittime_s}<span class="text-ink-muted">
                      in {item.waittime_s} s</span
                    >{/if}
                  {#if item.not_before && item.state === 'queued'}<span class="text-ink-muted">
                      · from <Time at={item.not_before} /></span
                    >{/if}
                </td>
                <td>
                  <span class={stateTone[item.state]}>{item.state}</span>
                  {#if item.error}<span class="text-offline"> {item.error}</span>{/if}
                </td>
                <td class="num">
                  {#if item.state === 'queued'}
                    <button
                      type="button"
                      class="btn btn-danger"
                      disabled={cancelling !== null}
                      onclick={() => cancel(item)}>Cancel</button
                    >
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>
</div>
