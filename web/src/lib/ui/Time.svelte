<script lang="ts">
  import { browser } from '$app/environment';
  import { clock } from './clock.svelte';
  import { formatDate, formatDateTime, formatUtc, relativeTime } from './format';

  let {
    at,
    mode = 'absolute',
    fallback = ''
  }: {
    at: string | null | undefined;
    mode?: 'absolute' | 'relative' | 'date' | 'both';
    fallback?: string;
  } = $props();

  const local = $derived(browser ? clock.local : false);
  const now = $derived(browser ? clock.now : Date.now());
  const absolute = $derived(mode === 'date' ? formatDate(at, local) : formatDateTime(at, local));
  const relative = $derived(relativeTime(at, now));
  const label = $derived(
    mode === 'relative' ? relative : mode === 'both' ? `${absolute} (${relative})` : absolute
  );
</script>

{#if at}
  <time datetime={at} title={mode === 'relative' ? `${absolute}, ${formatUtc(at)}` : formatUtc(at)}
    >{label}</time
  >
{:else}
  <span class="text-ink-muted">{fallback}</span>
{/if}
