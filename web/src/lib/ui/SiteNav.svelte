<script lang="ts">
  import { page } from '$app/state';
  import { isCurrent, type NavigationLink } from './navigation';

  let { entries }: { entries: NavigationLink[] } = $props();
  const current = $derived(page.url.pathname);
</script>

<nav aria-label="Site" class="-mx-2 flex flex-wrap items-center gap-x-1">
  {#each entries as entry (entry.href)}
    <a
      href={entry.href}
      aria-current={isCurrent(current, entry.href) ? 'page' : undefined}
      class="nav-link {entry.group === 'admin' ? 'ml-auto' : ''}"
    >
      {entry.label}
    </a>
  {/each}
</nav>
