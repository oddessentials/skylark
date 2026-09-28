<script lang="ts">
  import type { Platform } from '$lib/api/types';

  let { platform }: { platform: Platform } = $props();

  const labels: Record<Platform, string> = {
    steam: 'Steam',
    gdk: 'Xbox',
    ps5: 'PS5',
    mac: 'Mac',
    other: 'Other'
  };
</script>

<span class="chip text-ink-muted">{labels[platform]}</span>
