<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    value,
    detail = '',
    size = 'md',
    children
  }: {
    label: string;
    value?: string | number;
    detail?: string;
    size?: 'md' | 'lg';
    children?: Snippet;
  } = $props();
</script>

<div class="flex min-w-0 flex-col gap-1">
  <span class="stat-label">{label}</span>
  <span class="stat-value {size === 'lg' ? 'stat-value-lg' : ''}">
    {#if children}{@render children()}{:else}{value}{/if}
  </span>
  {#if detail}
    <span class="stat-detail">{detail}</span>
  {/if}
</div>
