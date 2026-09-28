<script lang="ts">
  import type { ActivityItem } from '$lib/api/types';
  import { formatDisplay } from '$lib/world/map';
  import { activityLabels, describeActivity, type ActivityTone } from './activity';
  import GuildLink from './GuildLink.svelte';
  import PlayerLink from './PlayerLink.svelte';
  import Time from './Time.svelte';

  let {
    item,
    timeMode = 'relative',
    compact = false
  }: {
    item: ActivityItem;
    timeMode?: 'relative' | 'absolute';
    compact?: boolean;
  } = $props();

  const view = $derived(describeActivity(item));
  const toneClass: Record<ActivityTone, string> = {
    neutral: 'bg-line-strong',
    good: 'bg-online',
    bad: 'bg-offline',
    warn: 'bg-warning',
    info: 'bg-sky-deep'
  };
</script>

<li class="flex gap-3.5 {compact ? 'py-1.5' : 'py-2.5'} text-[0.8125rem]" data-type={item.type}>
  <span class="diamond mt-2 {toneClass[view.tone]}" aria-hidden="true"></span>
  <div class="min-w-0 flex-1">
    <p class="leading-snug">
      {#each view.parts as part, index (index)}
        {#if part.kind === 'text'}{part.text}{:else if part.kind === 'player'}<PlayerLink
            player={part.player}
          />{:else if part.kind === 'guild'}<GuildLink guild={part.guild} />{:else}<q
            class="note text-[1.05rem] text-ink">{part.text}</q
          >{/if}
      {/each}
    </p>
    <p class="mt-0.5 flex flex-wrap gap-x-3 text-[0.7rem] text-ink-muted">
      {#if !compact}<span class="label whitespace-nowrap">{activityLabels[item.type]}</span>{/if}
      {#if view.channel}<span>{view.channel}</span>{/if}
      <Time at={item.ts} mode={timeMode} />
      {#if view.place && !compact}<span title="Map coordinates"
          >at {formatDisplay(view.place.x, view.place.y)}</span
        >{/if}
    </p>
  </div>
</li>
