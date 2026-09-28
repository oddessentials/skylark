<script lang="ts">
  import type { GuildPals } from '$lib/api/types';
  import Card from './Card.svelte';
  import { formatNumber, pluralize } from './format';
  import {
    defaultTarget,
    describeChain,
    describeEgg,
    describePairing,
    describePal,
    eggFor,
    eggGroups,
    emptyFilter,
    filterPals,
    genderMark,
    iconHref,
    keptPals,
    pairsFor,
    ruleNotes,
    speciesName,
    targetOptions,
    wantedList,
    type GenderFilter,
    type KeptPal
  } from './breeding';
  import PlayerLink from './PlayerLink.svelte';
  import Time from './Time.svelte';

  let { data, owner }: { data: GuildPals; owner: string } = $props();

  const pals = $derived(keptPals(data));
  const options = $derived(targetOptions(pals));
  const wanted = $derived(wantedList(pals));
  const groups = $derived(eggGroups(data.eggs));

  let text = $state('');
  let gender = $state<GenderFilter>('all');
  let member = $state<number | null>(null);
  let lucky = $state(false);
  let alpha = $state(false);
  let chosen = $state<string | null>(null);
  let showAllWanted = $state(false);
  let showAllPals = $state(false);

  const target = $derived(chosen ?? defaultTarget(options));
  const shown = $derived(filterPals(pals, { ...emptyFilter, text, gender, member, lucky, alpha }));
  const listed = $derived(showAllPals ? shown : shown.slice(0, 24));
  const pairs = $derived(target ? pairsFor(target, pals) : []);
  const reachable = $derived(wanted.filter((entry) => entry.chain));
  const unreachable = $derived(wanted.length - reachable.length);
  const wantedShown = $derived(showAllWanted ? reachable : reachable.slice(0, 8));
  const genders: { id: GenderFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'female', label: 'Female' },
    { id: 'male', label: 'Male' }
  ];

  function talents(kept: KeptPal): string {
    return `${kept.pal.talents.hp}/${kept.pal.talents.shot}/${kept.pal.talents.defense}`;
  }
</script>

{#snippet portrait(species: string, isAlpha: boolean, size: string)}
  {@const href = iconHref(species)}
  {#if href}
    <img
      src={href}
      alt=""
      width="64"
      height="64"
      class="pal-portrait {size} {isAlpha ? 'ring-2 ring-accent' : ''}"
      loading="lazy"
    />
  {:else}
    <span class="pal-portrait {size}" aria-hidden="true"></span>
  {/if}
{/snippet}

{#snippet palLine(kept: KeptPal)}
  <span class="flex min-w-0 items-center gap-2">
    {@render portrait(kept.species, kept.alpha, 'size-8')}
    <span class="min-w-0 truncate">
      <span class="font-semibold">{kept.label}</span>
      <span class="text-ink-muted">{genderMark(kept.gender)} Lv {kept.level}</span>
    </span>
  </span>
{/snippet}

<Card title="Breeding" id="breeding">
  {#snippet actions()}
    {#if data.saved_at}
      <span class="ticker">from the world save, <Time at={data.saved_at} mode="relative" /></span>
    {/if}
  {/snippet}
  {#if pals.length === 0 && data.eggs.length === 0}
    <p class="note">the world save has not listed the Pals of {owner} yet.</p>
  {:else}
    <div class="flex flex-col gap-6">
      <section class="flex flex-col gap-3" aria-labelledby="breeding-target">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="breeding-target" class="stat-label">Make a species</h3>
          <span class="text-[0.8125rem] text-ink-muted"
            >{pluralize(pals.length, 'Pal')} kept by {pluralize(
              data.members.length,
              'member'
            )}</span
          >
        </div>
        <label class="flex flex-wrap items-center gap-2 text-[0.8125rem]">
          <span class="text-ink-muted">Species</span>
          <select
            name="target"
            class="field"
            value={target ?? ''}
            onchange={(event) => (chosen = event.currentTarget.value || null)}
          >
            <option value="">pick one</option>
            {#each options as option (option.id)}
              <option value={option.id}
                >{option.number}
                {option.name}{option.pairs > 0
                  ? ` · ${pluralize(option.pairs, 'pair')}`
                  : ''}{option.owned ? ' · owned' : ''}</option
              >
            {/each}
          </select>
        </label>
        {#if target}
          {@const egg = eggFor(target)}
          <p class="text-[0.8125rem] text-ink-muted">
            {speciesName(target)} hatches from {egg ? `a ${egg}` : 'an egg'}.
            {#if pairs.length === 0}No owned female and male make it.{/if}
          </p>
          {#if pairs.length > 0}
            <ul class="breeding-pairs" aria-label="Pairs that make {speciesName(target)}">
              {#each pairs.slice(0, 12) as pair (pair.mother.id + pair.father.id)}
                <li class="breeding-pair" title={describePairing(pair)}>
                  {@render palLine(pair.mother)}
                  <span class="text-ink-faint" aria-hidden="true">×</span>
                  {@render palLine(pair.father)}
                  <span class="breeding-how">
                    {#if pair.result.via === 'unique'}unique pairing{:else if pair.result.tied.length > 0}rank
                      {pair.result.target}, tie to the higher rank{:else}rank {pair.result
                        .target}{/if}
                    {#if pair.shared.length > 0}
                      · share {pluralize(pair.shared.length, 'passive')}
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
            {#if pairs.length > 12}
              <p class="text-[0.8125rem] text-ink-muted">
                and {formatNumber(pairs.length - 12)} more pairs.
              </p>
            {/if}
          {/if}
        {/if}
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="breeding-wanted">
        <h3 id="breeding-wanted" class="stat-label">Nobody owns yet</h3>
        {#if reachable.length === 0}
          <p class="text-[0.8125rem] text-ink-muted">
            nothing within four breedings of the Pals kept here{unreachable > 0
              ? `, ${formatNumber(unreachable)} species out of reach`
              : ''}.
          </p>
        {:else}
          <ul
            class="flex flex-col divide-y divide-line text-[0.8125rem]"
            aria-label="Wanted species"
          >
            {#each wantedShown as entry (entry.id)}
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <button
                  type="button"
                  class="flex items-center gap-2 text-left hover:underline"
                  onclick={() => (chosen = entry.id)}
                >
                  {@render portrait(entry.id, false, 'size-8')}
                  <span class="text-ink-faint">{entry.number}</span>
                  <span class="font-semibold">{entry.name}</span>
                </button>
                <span class="text-ink-muted">{describeChain(entry.chain!)}</span>
              </li>
            {/each}
          </ul>
          {#if reachable.length > 8}
            <button
              type="button"
              class="seg self-start"
              onclick={() => (showAllWanted = !showAllWanted)}
              >{showAllWanted
                ? 'Fewer'
                : `All ${formatNumber(reachable.length)} within reach`}</button
            >
          {/if}
          {#if unreachable > 0}
            <p class="text-[0.8125rem] text-ink-muted">
              {formatNumber(unreachable)} species need Pals nobody here keeps.
            </p>
          {/if}
        {/if}
      </section>

      {#if data.eggs.length > 0}
        <section class="flex flex-col gap-3" aria-labelledby="breeding-eggs">
          <h3 id="breeding-eggs" class="stat-label">Eggs</h3>
          <ul class="flex flex-col divide-y divide-line text-[0.8125rem]" aria-label="Eggs">
            {#each groups as group (group.kind)}
              <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
                <span class="font-semibold">{group.kindName}</span>
                <span class="text-ink-faint">×{group.eggs.length}</span>
                <span class="flex basis-full flex-wrap gap-1.5">
                  {#each group.eggs as egg (egg.id)}
                    <span
                      class="chip gap-1.5 text-[0.7rem] tracking-normal normal-case"
                      title={describeEgg(egg, data.members)}
                      data-where={egg.where}
                      data-hatched={egg.hatched !== null}
                    >
                      {@render portrait(egg.species, egg.alpha, 'size-5')}
                      {speciesName(egg.species)}
                      {#if egg.where === 'incubator'}<span class="text-ink-faint"
                          >{egg.hatched ? 'rolled' : 'incubating'}</span
                        >{:else if egg.where === 'inventory'}<span class="text-ink-faint"
                          >{data.members[egg.member ?? -1]?.name ?? ''}</span
                        >{/if}
                    </span>
                  {/each}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="flex flex-col gap-3" aria-labelledby="breeding-kept">
        <h3 id="breeding-kept" class="stat-label">Kept Pals</h3>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.8125rem]">
          <input
            type="search"
            name="filter"
            class="field"
            placeholder="species, name, passive or keeper"
            aria-label="Filter the Pals"
            bind:value={text}
          />
          <span class="flex flex-wrap gap-1" role="group" aria-label="Gender">
            {#each genders as option (option.id)}
              <button
                type="button"
                class="seg"
                aria-pressed={gender === option.id}
                onclick={() => (gender = option.id)}>{option.label}</button
              >
            {/each}
          </span>
          {#if data.members.length > 1}
            <select
              name="member"
              class="field"
              aria-label="Keeper"
              value={member === null ? '' : String(member)}
              onchange={(event) =>
                (member =
                  event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}
            >
              <option value="">everyone</option>
              {#each data.members as entry, index (index)}
                <option value={String(index)}>{entry.name} · {formatNumber(entry.pals)}</option>
              {/each}
            </select>
          {/if}
          <label class="flex items-center gap-1.5"
            ><input type="checkbox" bind:checked={lucky} /> lucky</label
          >
          <label class="flex items-center gap-1.5"
            ><input type="checkbox" bind:checked={alpha} /> alpha</label
          >
        </div>
        {#if shown.length === 0}
          <p class="note">nothing matches.</p>
        {:else}
          <ul class="breeding-kept" aria-label="Kept Pals">
            {#each listed as kept (kept.id)}
              <li class="breeding-kept-row" title={describePal(kept)} data-lucky={kept.lucky}>
                {@render palLine(kept)}
                <span class="text-ink-muted">{talents(kept)}</span>
                <span class="flex min-w-0 flex-wrap gap-1">
                  {#each kept.pal.passives as passive (passive.id)}
                    <span
                      class="chip text-[0.66rem] tracking-normal normal-case"
                      data-rank={passive.rank}>{passive.name}</span
                    >
                  {/each}
                </span>
                <span class="truncate text-ink-muted">
                  {#if data.members[kept.member]?.player}<PlayerLink
                      player={data.members[kept.member]!.player!}
                    />{:else}{kept.keeper}{/if}
                </span>
              </li>
            {/each}
          </ul>
          {#if shown.length > 24}
            <button
              type="button"
              class="seg self-start"
              onclick={() => (showAllPals = !showAllPals)}
              >{showAllPals ? 'Fewer' : `All ${formatNumber(shown.length)}`}</button
            >
          {/if}
        {/if}
      </section>

      <ul
        class="flex flex-col gap-1 text-[0.72rem] text-ink-muted"
        aria-label="How the rule is known"
      >
        {#each ruleNotes as note, index (index)}
          <li>{note}</li>
        {/each}
      </ul>
    </div>
  {/if}
</Card>
