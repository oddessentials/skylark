<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import Meta from '$lib/ui/Meta.svelte';

  let { data } = $props();
  let password = $state('');
  let message = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = '';
    try {
      await api.adminLogin(password);
      password = '';
      await invalidateAll();
      await goto('/admin');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) message = 'That password is wrong.';
      else if (error instanceof ApiError && error.status === 429)
        message = 'Too many attempts. Wait a minute and try again.';
      else message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title="Admin login" description="Log in to manage players, jobs and backups." />

<div class="mx-auto flex w-full max-w-sm flex-col gap-5">
  <div class="rise flex flex-col gap-1.5">
    <p class="eyebrow">The gate</p>
    <h1 class="page-title">Admin login</h1>
  </div>
  {#if data.authenticated}
    <p class="text-[0.8125rem]">
      You are already logged in. <a href="/admin" class="text-accent hover:underline"
        >Go to the admin pages.</a
      >
    </p>
  {/if}
  <form class="card rise rise-2 flex flex-col gap-4 p-5 text-[0.8125rem]" onsubmit={submit}>
    <label class="flex flex-col gap-1.5">
      <span class="label">Password</span>
      <input
        type="password"
        name="password"
        autocomplete="current-password"
        required
        bind:value={password}
        class="field"
      />
    </label>
    <button type="submit" class="btn btn-primary self-start" disabled={busy || password === ''}>
      Log in
    </button>
    {#if message}
      <p class="text-danger" role="alert">{message}</p>
    {/if}
    <p class="note">
      One shared password, five attempts per minute. The session lasts twelve hours.
    </p>
  </form>
</div>
