<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/api/client';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import { isCurrent } from '$lib/ui/navigation';
  import Time from '$lib/ui/Time.svelte';

  let { data, children } = $props();
  let message = $state('');

  const links = [
    { href: '/admin', label: 'Health' },
    { href: '/admin/actions', label: 'Server actions' },
    { href: '/admin/players', label: 'Players' },
    { href: '/admin/events', label: 'Raw events' },
    { href: '/admin/collector', label: 'Collector' },
    { href: '/admin/settings', label: 'Settings' }
  ];

  async function logout() {
    try {
      await api.adminLogout();
      await invalidateAll();
      await goto('/admin/login');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<div class="flex flex-col gap-6">
  <div class="glass flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-[0.8125rem]">
    <span class="rail">Admin</span>
    {#if data.authenticated}
      <nav aria-label="Admin" class="flex flex-wrap gap-1">
        {#each links as link (link.href)}
          <a
            href={link.href}
            aria-current={isCurrent(page.url.pathname, link.href) &&
            (link.href !== '/admin' || page.url.pathname === '/admin')
              ? 'page'
              : undefined}
            class="seg">{link.label}</a
          >
        {/each}
      </nav>
      <span class="ticker ml-auto">
        Session ends <Time at={data.expiresAt} mode="relative" fallback="at an unknown time" />
      </span>
      <button type="button" class="btn" onclick={logout}>Log out</button>
    {:else}
      <span class="ticker">{data.setupRequired ? 'First start' : 'Not logged in'}</span>
    {/if}
  </div>
  {#if message}
    <p class="text-[0.8125rem] text-danger" role="alert">{message}</p>
  {/if}
  {#if data.sessionError}
    <ErrorNote error={data.sessionError} what="the admin session" />
  {/if}
  {@render children()}
</div>
