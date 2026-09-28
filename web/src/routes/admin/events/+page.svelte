<script lang="ts">
  import Card from '$lib/ui/Card.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';
  import Pager from '$lib/ui/Pager.svelte';
  import Time from '$lib/ui/Time.svelte';

  let { data } = $props();

  let open = $state<string | null>(null);
  const items = $derived(data.events.ok ? data.events.data.items : []);
</script>

<Meta title="Raw events" description="Every stored event with its data, newest first." />

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Admin"
    note="Events as the collector sent them, plus the ones the site wrote itself. Flagged events did not match the contract and were stored without being counted."
  >
    {#snippet heading()}Raw events{/snippet}
    {#snippet aside()}
      <form method="get" class="flex flex-wrap items-center gap-2 text-[0.8125rem]">
        <input
          type="text"
          name="type"
          value={data.type}
          placeholder="player.joined"
          class="field w-44"
        />
        <label class="label flex items-center gap-2 whitespace-nowrap text-ink">
          <input type="checkbox" name="invalid" value="true" checked={data.invalid} />
          Flagged only
        </label>
        <button type="submit" class="btn">Filter</button>
      </form>
    {/snippet}
  </PageHeader>

  <Card flush>
    {#if !data.events.ok}
      <div class="p-4"><ErrorNote error={data.events.error} what="the events" /></div>
    {:else if items.length === 0}
      <EmptyState message="No events match." />
    {:else}
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr><th>Time</th><th>Type</th><th>Player</th><th>From</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {#each items as item (item.id)}
              <tr>
                <td class="whitespace-nowrap"><Time at={item.ts} /></td>
                <td>
                  <button
                    type="button"
                    class="text-left font-semibold text-accent hover:underline"
                    aria-expanded={open === item.id}
                    onclick={() => (open = open === item.id ? null : item.id)}>{item.type}</button
                  >
                  {#if open === item.id}
                    <pre
                      class="mt-2 max-w-xl overflow-x-auto rounded bg-surface-sunken p-3 text-[0.7rem] leading-relaxed">{JSON.stringify(
                        item.data,
                        null,
                        2
                      )}</pre>
                    <p class="mt-1 text-[0.7rem] text-ink-muted">
                      run {item.run_id.slice(0, 8)} · seq {item.seq} · received <Time
                        at={item.received_at}
                      />
                    </p>
                  {/if}
                </td>
                <td>{item.player?.name ?? ''}</td>
                <td class="text-ink-muted">{item.source}</td>
                <td>
                  {#if item.invalid}<span class="text-warning">flagged: {item.invalid}</span
                    >{:else if item.quiet}<span class="text-ink-muted">not in the feed</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="px-3 pb-3">
        <Pager nextCursor={data.events.data.next_cursor} count={items.length} label="events" />
      </div>
    {/if}
  </Card>
</div>
