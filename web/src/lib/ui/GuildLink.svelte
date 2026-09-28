<script lang="ts">
  import type { GuildRef } from '$lib/api/types';

  let { guild }: { guild: GuildRef } = $props();
</script>

<a href="/guilds/{encodeURIComponent(guild.id)}" class="font-semibold text-ember hover:underline"
  >{guild.name}</a
>
