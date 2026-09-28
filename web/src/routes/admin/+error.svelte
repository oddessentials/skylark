<script lang="ts">
  import { page } from '$app/state';
  import Meta from '$lib/ui/Meta.svelte';
</script>

<Meta
  title={`${page.status} ${page.error?.message ?? 'Error'}`}
  description="Nothing on the perch."
/>

<div
  class="card mx-auto grid max-w-4xl items-center gap-8 p-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:p-8"
>
  <picture class="rise order-last md:order-first">
    <source type="image/avif" srcset="/art/perch-700.avif" />
    <img
      src="/art/perch-700.webp"
      alt=""
      width="700"
      height="620"
      class="w-full rounded-(--radius-card) border border-line"
    />
  </picture>
  <div class="rise rise-2 flex flex-col gap-3">
    <p class="eyebrow">{page.status}</p>
    <h1 class="page-title">
      {#if page.status === 401 || page.status === 403}
        Admin access needed
      {:else if page.status === 404}
        Nothing here
      {:else}
        Something went wrong
      {/if}
    </h1>
    <p class="note text-[1.25rem]">nothing on the perch.</p>
    <p class="text-[0.8125rem] text-ink-muted">
      {page.status}: {page.error?.message ?? 'unknown error'}
    </p>
    <p class="flex flex-wrap gap-3">
      <a href="/admin/login" class="btn btn-primary">Log in</a>
      <a href="/" class="btn">Back to today</a>
    </p>
  </div>
</div>
