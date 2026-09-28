<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title = '',
    id = '',
    description = '',
    actions,
    children,
    flush = false
  }: {
    title?: string;
    id?: string;
    description?: string;
    actions?: Snippet;
    children: Snippet;
    flush?: boolean;
  } = $props();
</script>

<section class="card flex flex-col" id={id || undefined}>
  {#if title || actions}
    <header class="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-5 py-3">
      {#if title}
        <h2 class="rail">{title}</h2>
      {/if}
      {#if description}
        <p class="note">{description}</p>
      {/if}
      {#if actions}
        <div class="ml-auto flex flex-wrap items-center gap-2 text-sm">{@render actions()}</div>
      {/if}
    </header>
  {/if}
  <div class={flush ? '' : 'p-5'}>
    {@render children()}
  </div>
</section>
