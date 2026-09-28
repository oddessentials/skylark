<script lang="ts">
  import { page } from '$app/state';
  import { withParams } from './query';

  let {
    nextCursor,
    count,
    label = 'items'
  }: { nextCursor: string | null; count: number; label?: string } = $props();

  const hasCursor = $derived(page.url.searchParams.has('cursor'));
  const newestHref = $derived(withParams(page.url, { cursor: null }));
  const olderHref = $derived(nextCursor ? withParams(page.url, { cursor: nextCursor }) : null);
</script>

{#if hasCursor || olderHref}
  <nav class="flex flex-wrap items-center gap-3 px-1 pt-3" aria-label="Pages">
    {#if hasCursor}
      <a href={newestHref} class="btn">Newest</a>
    {/if}
    {#if olderHref}
      <a href={olderHref} class="btn">Older</a>
    {/if}
    <span class="ticker">{count} {label} on this page</span>
  </nav>
{/if}
