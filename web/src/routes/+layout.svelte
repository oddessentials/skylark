<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import AtmosphereToggle from '$lib/ui/AtmosphereToggle.svelte';
  import Backdrop from '$lib/ui/Backdrop.svelte';
  import { atmosphere } from '$lib/ui/atmosphere.svelte';
  import { clock } from '$lib/ui/clock.svelte';
  import Emblem from '$lib/ui/Emblem.svelte';
  import { provideLive } from '$lib/ui/live.svelte';
  import SiteNav from '$lib/ui/SiteNav.svelte';
  import StatusStrip from '$lib/ui/StatusStrip.svelte';
  import { versionLine } from '$lib/ui/versions';
  import Wordmark from '$lib/ui/Wordmark.svelte';
  import { worldClock } from '$lib/ui/worldclock.svelte';

  let { data, children } = $props();

  const live = provideLive();

  $effect(() => clock.start());
  $effect(() => worldClock.start());
  $effect(() => atmosphere.start());
  $effect(() => {
    if (!data.streamEnabled) return;
    live.start();
    return () => live.stop();
  });

  const status = $derived(live.status ?? data.status);
  const bare = $derived(page.route.id === '/watch');
  const canonical = $derived(`${page.url.origin}${page.url.pathname}`);
</script>

<svelte:head>
  <title>{data.siteName}</title>
  <link rel="canonical" href={canonical} />
  <meta property="og:site_name" content={data.siteName} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content="{page.url.origin}/social.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{page.url.origin}/social.jpg" />
  <meta
    name="description"
    content="Who is on {data.siteName}, what they are up to, and what happened."
  />
</svelte:head>

{#if bare}
  {@render children()}
{:else}
  <div class="relative flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only z-50 rounded-md bg-surface-raised px-4 py-2 text-ink shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >Skip to the page</a
    >
    <Backdrop />
    <header class="relative z-10 bg-linear-to-b from-surface/90 via-surface/60 to-transparent">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-2 px-(--gutter) pt-4 pb-1">
        <div class="flex items-center gap-4">
          <a href="/" class="flex items-center gap-2.5 text-ink hover:text-accent-bright">
            <Emblem
              size={32}
              badge
              class="text-accent drop-shadow-[0_2px_6px_rgba(13,110,134,0.35)]"
            />
            <Wordmark name={data.siteName} />
          </a>
          <span class="note hidden sm:inline">a palworld server log</span>
          <div class="ml-auto flex items-center gap-2">
            <AtmosphereToggle />
          </div>
        </div>
        <SiteNav entries={data.navigation} />
      </div>
    </header>
    <StatusStrip {status} error={data.statusError} stream={live.stream} />
    <main
      id="main"
      tabindex="-1"
      class="relative z-10 mx-auto w-full max-w-6xl flex-1 px-(--gutter) pt-8 pb-12 focus:outline-none"
    >
      {#key page.url.pathname}
        <div class="pagein">
          {@render children()}
        </div>
      {/key}
    </main>
    <footer class="relative z-10 border-t border-line bg-surface/80 backdrop-blur-sm">
      <div
        class="mx-auto flex w-full max-w-6xl flex-wrap items-end gap-x-8 gap-y-4 px-(--gutter) py-6"
      >
        <div class="flex max-w-2xl flex-col gap-1">
          <span class="note text-accent">a lark sings over the field at dawn.</span>
          <span class="ticker"
            >Skylark is an unofficial fan project, not affiliated with or endorsed by Pocketpair,
            Inc. Palworld is a trademark of Pocketpair, Inc.</span
          >
          <span class="ticker"
            >Everything here comes from the server's own interfaces; players install nothing. Times
            are stored in UTC and shown in your time zone.</span
          >
          <span class="ticker">{versionLine(__APP_VERSION__, status)}</span>
        </div>
        <nav aria-label="Machine-readable" class="ml-auto flex flex-wrap gap-x-5 gap-y-2">
          <a href="/api/v1/status" class="nav-link px-0">Status JSON</a>
          <a href="/api/v1/openapi.json" class="nav-link px-0">API contract</a>
        </nav>
      </div>
    </footer>
  </div>
{/if}
