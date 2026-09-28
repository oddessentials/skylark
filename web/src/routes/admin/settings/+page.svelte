<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import type { AdminSettings, AdminSettingsUpdate, SiteFeatures } from '$lib/api/types';
  import Card from '$lib/ui/Card.svelte';
  import ErrorNote from '$lib/ui/ErrorNote.svelte';
  import Meta from '$lib/ui/Meta.svelte';
  import PageHeader from '$lib/ui/PageHeader.svelte';

  let { data } = $props();

  const features: { name: keyof SiteFeatures; label: string; description: string }[] = [
    {
      name: 'positions',
      label: 'Player positions',
      description:
        'Where players are on the live map, their trails and where they were knocked out.'
    },
    {
      name: 'bases',
      label: 'Bases',
      description:
        'Base locations on the map and guild pages. On PvP servers with raiding you may want this off.'
    },
    {
      name: 'pals',
      label: 'Pals',
      description: 'The Pals out with each player, base workers and wild Pals near players.'
    },
    {
      name: 'chat',
      label: 'Chat',
      description: 'Global and nearby chat in the feed, on the chat page and in the stream.'
    },
    {
      name: 'guild_chat',
      label: 'Guild chat',
      description: 'Guild channel messages as well. Guilds may expect these to stay private.'
    }
  ];

  let saved = $state<AdminSettings | null>(
    untrack(() => (data.settings.ok ? data.settings.data : null))
  );
  let siteName = $state(untrack(() => saved?.site_name ?? ''));
  let toggles = $state<SiteFeatures>(
    untrack(() =>
      saved
        ? { ...saved.features }
        : { chat: true, guild_chat: false, positions: true, bases: true, pals: true }
    )
  );
  let message = $state('');
  let problem = $state('');
  let busy = $state(false);

  const nameLocked = $derived(saved?.locked.includes('site_name') ?? false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = '';
    problem = '';
    if (!saved) return;
    const body: AdminSettingsUpdate = {};
    const name = siteName.trim();
    if (!nameLocked && name !== saved.site_name) {
      if (name.length < 1 || name.length > 60) {
        problem = 'The site name must be 1 to 60 characters.';
        return;
      }
      body.site_name = name;
    }
    const changed = Object.fromEntries(
      Object.entries(toggles).filter(
        ([key, value]) => saved!.features[key as keyof SiteFeatures] !== value
      )
    );
    if (Object.keys(changed).length > 0) body.features = changed;
    if (Object.keys(body).length === 0) {
      message = 'Nothing changed.';
      return;
    }
    busy = true;
    try {
      saved = await api.updateAdminSettings(body);
      siteName = saved.site_name;
      toggles = { ...saved.features };
      message = 'Saved.';
      await invalidateAll();
    } catch (error) {
      problem =
        error instanceof ApiError && error.status === 403
          ? 'The request was refused: admin changes must come from this site.'
          : error instanceof Error
            ? error.message
            : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title="Admin settings" description="Name the site and choose what it shows." />

<div class="flex flex-col gap-6">
  <PageHeader
    eyebrow="Admin"
    note="A setting given by an environment variable wins over the value stored here and cannot be changed on this page."
  >
    {#snippet heading()}Settings{/snippet}
  </PageHeader>

  {#if !data.settings.ok}
    <ErrorNote error={data.settings.error} what="the settings" />
  {:else}
    <Card title="Site">
      <form class="flex flex-col gap-5 text-[0.8125rem]" onsubmit={submit}>
        <label class="flex flex-col gap-1.5">
          <span class="label">Site name</span>
          <input
            type="text"
            class="field"
            maxlength="60"
            disabled={nameLocked}
            bind:value={siteName}
          />
          <span class="note"
            >{nameLocked
              ? 'Set by PUBLIC_SITE_NAME.'
              : 'Shown in the header, the browser tab and link previews.'}</span
          >
        </label>

        <fieldset class="flex flex-col gap-3">
          <legend class="label">What the public pages show</legend>
          {#each features as option (option.name)}
            <div class="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="feature-{option.name}"
                class="mt-0.5"
                aria-describedby="feature-{option.name}-note"
                bind:checked={toggles[option.name]}
              />
              <div class="flex flex-col gap-0.5">
                <label for="feature-{option.name}">{option.label}</label>
                <span class="note" id="feature-{option.name}-note">{option.description}</span>
              </div>
            </div>
          {/each}
          <p class="note">
            The site keeps recording everything; a switch only decides what visitors see.
          </p>
        </fieldset>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn btn-primary" disabled={busy}>Save</button>
          {#if problem}<span class="text-danger" role="alert">{problem}</span>{/if}
          {#if message}<span role="status">{message}</span>{/if}
        </div>
      </form>
    </Card>
  {/if}
</div>
