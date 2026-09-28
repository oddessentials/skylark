<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    eyebrow = '',
    note = '',
    heading,
    aside,
    children
  }: {
    eyebrow?: string;
    note?: string;
    heading: Snippet;
    aside?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<header class="flex flex-col gap-4">
  <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
    <div class="rise flex min-w-0 flex-col gap-1.5">
      {#if eyebrow}
        <p class="eyebrow">{eyebrow}</p>
      {/if}
      <h1 class="page-title">{@render heading()}</h1>
      {#if note}
        <p
          class="max-w-2xl text-[0.8125rem] leading-relaxed text-ink-muted [text-shadow:0_1px_10px_rgba(255,253,246,0.95)]"
        >
          {note}
        </p>
      {/if}
    </div>
    {#if aside}
      <div class="rise rise-2 min-w-0">{@render aside()}</div>
    {/if}
  </div>
  {#if children}
    <div class="rise rise-3">{@render children()}</div>
  {/if}
</header>
