<script lang="ts">
  import { page } from '$app/state';

  let { title, description }: { title: string; description: string } = $props();

  const siteName = $derived(typeof page.data.siteName === 'string' ? page.data.siteName : '');
  const full = $derived(siteName && title !== siteName ? `${title} · ${siteName}` : title);
</script>

<svelte:head>
  <title>{full}</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={full} />
  <meta property="og:description" content={description} />
  <meta name="twitter:title" content={full} />
  <meta name="twitter:description" content={description} />
</svelte:head>
