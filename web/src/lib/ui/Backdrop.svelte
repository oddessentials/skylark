<script lang="ts">
  import { atmosphere } from './atmosphere.svelte';
  import type { SceneryStatus } from './scenery';

  let canvas: HTMLCanvasElement | undefined = $state();
  let artwork: HTMLImageElement | undefined = $state();
  let status = $state<SceneryStatus>('still');

  $effect(() => {
    const target = canvas;
    const source = artwork;
    if (!target || !source) return;
    let cancelled = false;
    let release: (() => void) | undefined;
    status = 'loading';
    const start = async () => {
      try {
        const [{ createScenery }] = await Promise.all([import('./scenery'), source.decode()]);
        if (!cancelled) release = createScenery(target, source, (value) => (status = value));
      } catch {
        if (!cancelled) status = 'unavailable';
      }
    };
    const timer = window.setTimeout(() => void start(), 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      release?.();
    };
  });

  $effect(() => {
    atmosphere.status = atmosphere.active ? status : 'still';
  });
</script>

<div class="backdrop" aria-hidden="true" data-scenery={atmosphere.active ? status : 'still'}>
  <picture>
    <source
      type="image/avif"
      srcset="/art/field-800.avif 800w, /art/field-1600.avif 1600w"
      sizes="100vw"
    />
    <source
      type="image/webp"
      srcset="/art/field-800.webp 800w, /art/field-1600.webp 1600w"
      sizes="100vw"
    />
    <img
      bind:this={artwork}
      src="/art/field-1600.webp"
      alt=""
      width="1600"
      height="900"
      decoding="async"
      fetchpriority="high"
    />
  </picture>
  {#if atmosphere.active}
    <canvas bind:this={canvas} class="scenery-canvas"></canvas>
  {/if}
  <div class="scenery-veil"></div>
</div>
