<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { ApiError, api } from '$lib/api/client';
  import Meta from '$lib/ui/Meta.svelte';

  const minimumLength = 8;
  const maximumLength = 200;

  let password = $state('');
  let repeated = $state('');
  let message = $state('');
  let busy = $state(false);

  const mismatch = $derived(repeated !== '' && repeated !== password);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = '';
    if (password.length < minimumLength) {
      message = `Use at least ${minimumLength} characters.`;
      return;
    }
    if (password !== repeated) {
      message = 'The two passwords are not the same.';
      return;
    }
    busy = true;
    try {
      await api.adminSetup(password);
      password = '';
      repeated = '';
      await invalidateAll();
      await goto('/admin');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        message = 'A password is already set. Log in with it instead.';
      else if (error instanceof ApiError && error.status === 429)
        message = 'Too many attempts. Wait a minute and try again.';
      else if (error instanceof ApiError && error.status === 403)
        message = "The request was refused. Open this page on the site's own address.";
      else message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<Meta title="Admin setup" description="Set the admin password for this site." />

<div class="mx-auto flex w-full max-w-sm flex-col gap-5">
  <div class="rise flex flex-col gap-1.5">
    <p class="eyebrow">First start</p>
    <h1 class="page-title">Set the admin password</h1>
  </div>
  <form class="card rise rise-2 flex flex-col gap-4 p-5 text-[0.8125rem]" onsubmit={submit}>
    <label class="flex flex-col gap-1.5">
      <span class="label">Password</span>
      <input
        type="password"
        name="password"
        autocomplete="new-password"
        maxlength={maximumLength}
        bind:value={password}
        class="field"
      />
    </label>
    <label class="flex flex-col gap-1.5">
      <span class="label">Repeat the password</span>
      <input
        type="password"
        name="repeated"
        autocomplete="new-password"
        maxlength={maximumLength}
        aria-invalid={mismatch}
        bind:value={repeated}
        class="field"
      />
    </label>
    <button
      type="submit"
      class="btn btn-primary self-start"
      disabled={busy || password === '' || repeated === ''}
    >
      Set password
    </button>
    {#if message}
      <p class="text-danger" role="alert">{message}</p>
    {/if}
    <p class="note">
      Whoever opens this page first sets the password, so do it right after deploying. It is stored
      as a scrypt hash. At least {minimumLength} characters.
    </p>
  </form>
</div>
