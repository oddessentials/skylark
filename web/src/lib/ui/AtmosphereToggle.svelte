<script lang="ts">
  import { atmosphere } from './atmosphere.svelte';

  const unavailable = $derived(atmosphere.status === 'unavailable');
  const settled = $derived(atmosphere.active && atmosphere.status === 'still');
  const playing = $derived(atmosphere.active && !unavailable && !settled);
  const label = $derived(playing ? 'Scenery on' : 'Scenery still');
  const title = $derived(
    atmosphere.reducedMotion
      ? 'Scenery is still to respect your reduced-motion preference'
      : atmosphere.constrained
        ? 'Scenery is still to save device resources'
        : atmosphere.suspended > 0
          ? 'Scenery is paused while measuring your connection and device'
          : unavailable
            ? 'Animated scenery is unavailable; the still artwork is shown'
            : settled
              ? 'Scenery is still to keep your device responsive'
              : playing
                ? 'Pause the animated scenery'
                : 'Animate the scenery'
  );
</script>

<button
  type="button"
  class="btn hidden gap-2 whitespace-nowrap md:inline-flex"
  data-atmosphere-toggle
  aria-pressed={playing}
  disabled={!atmosphere.available || unavailable || settled || atmosphere.suspended > 0}
  {title}
  onclick={() => atmosphere.toggle()}
>
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none">
    <path
      d="M1 5c3-5 5 5 9 0s5 0 5 0M1 9c3-5 5 5 9 0s5 0 5 0M1 13c3-5 5 5 9 0s5 0 5 0"
      stroke="currentColor"
      stroke-width="1.2"
    />
  </svg>
  <span class="hidden lg:inline">{label}</span>
  <span class="sr-only lg:hidden">{label}</span>
</button>
