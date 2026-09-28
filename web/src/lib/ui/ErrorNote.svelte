<script lang="ts">
  import type { LoadFailure } from './load';

  let { error, what = 'this section' }: { error: LoadFailure; what?: string } = $props();

  const explanation = $derived.by(() => {
    switch (error.code) {
      case 'rate_limited':
        return 'The API is rate limited right now. Reload in a minute.';
      case 'unavailable':
        return 'The database or the site cannot be reached right now. Reload in a moment.';
      case 'not_found':
        return 'Nothing was found at this address.';
      case 'unauthorized':
        return 'An admin session is required.';
      case 'not_implemented':
        return 'This part of the API is not built yet.';
      default:
        return error.message;
    }
  });
</script>

<p
  class="border-l-2 border-danger bg-surface-sunken/60 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed"
  role="status"
>
  <span class="font-semibold text-danger">Could not load {what}.</span>
  {explanation}
  <span class="text-ink-muted">({error.status || 'network'} {error.code})</span>
</p>
