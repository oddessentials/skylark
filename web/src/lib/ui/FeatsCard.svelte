<script lang="ts">
  import type { PlayerFeats } from '$lib/api/types';
  import Card from './Card.svelte';
  import Stat from './Stat.svelte';
  import { formatNumber } from './format';

  let { feats }: { feats: PlayerFeats } = $props();
</script>

<Card title="Seen live">
  {#snippet actions()}
    <span class="ticker">from the server mod</span>
  {/snippet}
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
    <Stat label="Caught" value={formatNumber(feats.captures)} />
    <Stat label="Hatched" value={formatNumber(feats.hatches)} />
    <Stat label="Bosses" value={formatNumber(feats.bosses)} />
    <Stat label="Technologies" value={formatNumber(feats.technologies)} />
    <Stat label="Built" value={formatNumber(feats.builds)} />
  </div>
</Card>
