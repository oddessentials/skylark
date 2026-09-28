<script lang="ts">
  import type { PlayerRef } from '$lib/api/types';

  let { player, quiet = false }: { player: PlayerRef; quiet?: boolean } = $props();
</script>

<a
  href="/players/{player.id}"
  class={quiet
    ? 'text-ink hover:text-accent hover:underline'
    : 'font-semibold text-accent hover:text-accent-bright hover:underline'}>{player.name}</a
>
