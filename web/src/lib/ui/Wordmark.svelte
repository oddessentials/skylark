<script lang="ts">
  let { name }: { name: string } = $props();

  const words = $derived(name.trim().split(/\s+/));
  const lead = $derived(words.length > 1 ? `${words.slice(0, -1).join(' ')} ` : '');
  const last = $derived(words[words.length - 1] ?? '');
</script>

<span class="wordmark">{lead}<em>{last}</em></span>
