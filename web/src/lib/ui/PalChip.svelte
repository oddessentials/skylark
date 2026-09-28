<script lang="ts">
  import { speciesInfo } from '$lib/world/species';

  let {
    species,
    name = null,
    level = null,
    alpha = false
  }: { species: string; name?: string | null; level?: number | null; alpha?: boolean } = $props();

  const info = $derived(speciesInfo(species));
  const colors = $derived(info?.elements.map((element) => element.color) ?? []);
  const fill = $derived(
    colors.length > 1
      ? `conic-gradient(${colors[0]} 0 50%, ${colors[1]} 50% 100%)`
      : (colors[0] ?? 'var(--color-steel)')
  );
  const label = $derived(name ?? info?.name ?? species);
  const title = $derived(
    [
      alpha ? `alpha ${info?.name ?? species}` : (info?.name ?? species),
      info ? info.elements.map((element) => element.name).join(' and ') : null,
      level !== null ? `level ${level}` : null
    ]
      .filter(Boolean)
      .join(', ')
  );
</script>

<span class="chip gap-1.5 text-[0.7rem] tracking-normal normal-case" {title}>
  <span
    class="inline-block size-2.5 shrink-0 rounded-full {alpha
      ? 'ring-2 ring-accent'
      : 'ring-1 ring-black/15'}"
    style="background: {fill}"
    aria-hidden="true"
  ></span>
  <span class="truncate">{label}</span>
  {#if level !== null}<span class="text-ink-faint">Lv {level}</span>{/if}
</span>
