<script lang="ts">
  import { page } from '$app/state';

  const missing = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{missing ? 'Nothing on the perch' : 'Something went wrong'}</title>
</svelte:head>

<div class="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
  <picture>
    <source type="image/avif" srcset="/art/perch-700.avif" />
    <img
      src="/art/perch-700.webp"
      alt=""
      width="700"
      height="620"
      class="w-full rounded-(--radius-card) border border-line shadow-[0_18px_44px_-28px_rgba(36,31,24,0.55)]"
    />
  </picture>
  <div class="flex flex-col gap-3">
    <p class="eyebrow">{page.status}</p>
    <h1 class="page-title">{missing ? 'Nothing on the perch' : 'The lark lost its song'}</h1>
    <p class="note text-[1.35rem]">
      {missing ? 'nothing lives at this address.' : 'something went wrong on our side.'}
    </p>
    <p class="text-[0.8125rem] text-ink-muted">{page.error?.message ?? ''}</p>
    <p><a href="/" class="btn btn-primary">Back to today</a></p>
  </div>
</div>
