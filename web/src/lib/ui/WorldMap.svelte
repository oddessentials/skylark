<script lang="ts">
  import type { MapState, TrailPoint } from '$lib/api/types';
  import { formatDisplay, type MapId } from '$lib/world/map';
  import { primaryColor, speciesInfo } from '$lib/world/species';
  import { isContinuous } from '$lib/world/movement';
  import { chartOf, guildColor, initialOf, mapSize, onMap, project, rectOf } from './map';

  let {
    world,
    trail = null,
    highlight = null,
    compact = false,
    landmarks = true,
    initialMap = 'MainMap',
    focus = null,
    label = 'World map'
  }: {
    world: MapState | null;
    trail?: TrailPoint[] | null;
    highlight?: number | null;
    compact?: boolean;
    landmarks?: boolean;
    initialMap?: MapId;
    focus?: { x: number; y: number } | null;
    label?: string;
  } = $props();

  let mapId = $derived<MapId>(initialMap);
  let view = $state({ x: 0, y: 0, w: mapSize });
  let svg: SVGSVGElement | undefined = $state();
  let drag: { x: number; y: number; vx: number; vy: number; id: number } | null = null;
  let hovered = $state<string | null>(null);

  $effect(() => {
    if (!focus) return;
    const rect = rectOf(mapId);
    if (!onMap(focus.x, focus.y, mapId)) return;
    const at = project(focus.x, focus.y, rect);
    const w = compact ? 360 : 420;
    view = clampView({ x: at.x - w / 2, y: at.y - w / 2, w });
  });

  const fitted = $derived.by(() => {
    if (!compact || focus) return null;
    const points = [
      ...(world?.players ?? []).map((player) => ({ x: player.x, y: player.y })),
      ...(world?.bases ?? []).map((base) => ({ x: base.x, y: base.y }))
    ]
      .filter((point) => onMap(point.x, point.y, mapId))
      .map((point) => project(point.x, point.y, rectOf(mapId)));
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = Math.min(mapSize, Math.max(260, maxX - minX + 120, maxY - minY + 120));
    return clampView({ x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - w / 2, w });
  });
  const shown = $derived(fitted ?? view);
  const chart = $derived(chartOf(mapId));
  const rect = $derived(rectOf(mapId));
  const k = $derived((shown.w / mapSize) * (compact ? 1.6 : 1));
  const zoomed = $derived(shown.w < 520);

  const players = $derived(
    (world?.players ?? [])
      .filter((player) => onMap(player.x, player.y, mapId))
      .map((player) => ({ ...player, at: project(player.x, player.y, rect) }))
  );
  const elsewhere = $derived(
    (world?.players ?? []).filter((player) => !onMap(player.x, player.y, mapId))
  );
  const bases = $derived(
    (world?.bases ?? [])
      .filter((base) => onMap(base.x, base.y, mapId))
      .map((base) => ({ ...base, at: project(base.x, base.y, rect) }))
  );
  const wild = $derived(
    (world?.wild ?? [])
      .filter((pal) => onMap(pal.x, pal.y, mapId))
      .map((pal) => ({ ...pal, at: project(pal.x, pal.y, rect) }))
  );
  const deaths = $derived(
    (world?.deaths ?? [])
      .filter((death) => onMap(death.x, death.y, mapId))
      .map((death) => ({ ...death, at: project(death.x, death.y, rect) }))
  );
  const trailPath = $derived.by(() => {
    const points = (trail ?? []).filter((point) => onMap(point.x, point.y, mapId));
    if (points.length < 2) return '';
    return points
      .map((point, index) => {
        const at = project(point.x, point.y, rect);
        const previous = points[index - 1];
        const joined = previous !== undefined && continuous(previous, point);
        return `${joined ? 'L' : 'M'} ${at.x.toFixed(1)} ${at.y.toFixed(1)}`;
      })
      .join(' ');
  });

  function continuous(from: TrailPoint, to: TrailPoint): boolean {
    return isContinuous(
      { x: from.x, y: from.y, seconds: Date.parse(from.at) / 1000 },
      { x: to.x, y: to.y, seconds: Date.parse(to.at) / 1000 }
    );
  }
  const trailEnds = $derived.by(() => {
    const points = (trail ?? []).filter((point) => onMap(point.x, point.y, mapId));
    if (points.length === 0) return null;
    return {
      start: project(points[0]!.x, points[0]!.y, rect),
      end: project(points[points.length - 1]!.x, points[points.length - 1]!.y, rect)
    };
  });

  const gridLines = Array.from({ length: 9 }, (_, index) => (index * mapSize) / 8);

  function clampView(next: { x: number; y: number; w: number }) {
    const w = Math.min(mapSize, Math.max(60, next.w));
    return {
      w,
      x: Math.min(mapSize - w, Math.max(0, next.x)),
      y: Math.min(mapSize - w, Math.max(0, next.y))
    };
  }

  function toSvg(clientX: number, clientY: number): { x: number; y: number } {
    if (!svg) return { x: 0, y: 0 };
    const box = svg.getBoundingClientRect();
    return {
      x: view.x + ((clientX - box.left) / box.width) * view.w,
      y: view.y + ((clientY - box.top) / box.height) * view.w
    };
  }

  function zoomAt(factor: number, center: { x: number; y: number }) {
    const w = view.w * factor;
    view = clampView({
      w,
      x: center.x - ((center.x - view.x) / view.w) * w,
      y: center.y - ((center.y - view.y) / view.w) * w
    });
  }

  function onWheel(event: WheelEvent) {
    if (compact) return;
    event.preventDefault();
    zoomAt(event.deltaY > 0 ? 1.2 : 1 / 1.2, toSvg(event.clientX, event.clientY));
  }

  function onPointerDown(event: PointerEvent) {
    if (compact || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, id: event.pointerId };
    svg?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || !svg || event.pointerId !== drag.id) return;
    const box = svg.getBoundingClientRect();
    const scale = view.w / box.width;
    view = clampView({
      w: view.w,
      x: drag.vx - (event.clientX - drag.x) * scale,
      y: drag.vy - (event.clientY - drag.y) * scale
    });
  }

  function onPointerUp(event: PointerEvent) {
    if (drag && event.pointerId === drag.id) drag = null;
  }

  function reset() {
    view = { x: 0, y: 0, w: mapSize };
  }

  function nudge(factor: number) {
    zoomAt(factor, { x: view.x + view.w / 2, y: view.y + view.w / 2 });
  }
</script>

<div class="map-frame relative" data-compact={compact ? 'true' : undefined}>
  <svg
    bind:this={svg}
    viewBox="{shown.x.toFixed(2)} {shown.y.toFixed(2)} {shown.w.toFixed(2)} {shown.w.toFixed(2)}"
    class="block aspect-square w-full touch-none select-none {compact ? '' : 'cursor-grab'}"
    role="img"
    aria-label="{label}: {players.length} players, {bases.length} bases shown"
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <defs>
      <filter
        id="map-goo"
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
        color-interpolation-filters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
        />
      </filter>
      <filter
        id="map-shore"
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
        color-interpolation-filters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -5"
        />
      </filter>
      <pattern id="map-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 8 L8 0" stroke="var(--color-water)" stroke-opacity="0.08" stroke-width="1" />
      </pattern>
    </defs>
    <rect x="0" y="0" width={mapSize} height={mapSize} class="map-sea" />
    <rect x="0" y="0" width={mapSize} height={mapSize} fill="url(#map-hatch)" />
    <g filter="url(#map-shore)" class="map-shore">
      {#each chart.regions as region (region.id)}
        {#each region.paths as path, index (index)}
          <path d={path} />
        {/each}
      {/each}
    </g>
    <g filter="url(#map-goo)" class="map-land">
      {#each chart.regions as region (region.id)}
        {#each region.paths as path, index (index)}
          <path d={path} />
        {/each}
      {/each}
    </g>
    {#each gridLines as line (line)}
      <line x1={line} y1="0" x2={line} y2={mapSize} class="map-grid" stroke-width={k} />
      <line x1="0" y1={line} x2={mapSize} y2={line} class="map-grid" stroke-width={k} />
    {/each}
    {#if !compact}
      {#each chart.regions as region (region.id)}
        {#if region.label && (zoomed || chart.majorAreas.has(region.id))}
          <text
            x={region.label.x}
            y={region.label.y}
            class="map-region"
            font-size={(zoomed ? 12 : 11) * k}
            opacity={zoomed ? 0.9 : 0.7}>{region.name}</text
          >
        {/if}
      {/each}
    {/if}
    {#if landmarks}
      {#each chart.landmarks as landmark (landmark.id)}
        {#if landmark.kind === 'statue'}
          <path
            d="M {landmark.at.x} {landmark.at.y - 4 * k} l {3 * k} {4 * k} l {-3 * k} {4 *
              k} l {-3 * k} {-4 * k} Z"
            class="map-statue"
            role="presentation"
            onpointerenter={() => (hovered = landmark.name)}
            onpointerleave={() => (hovered = null)}
          />
        {:else}
          <path
            d="M {landmark.at.x - 4 * k} {landmark.at.y + 5 * k} L {landmark.at.x} {landmark.at.y -
              7 * k} L {landmark.at.x + 4 * k} {landmark.at.y + 5 * k} Z"
            class="map-tower"
            role="presentation"
            onpointerenter={() => (hovered = landmark.name)}
            onpointerleave={() => (hovered = null)}
          />
        {/if}
      {/each}
    {/if}
    {#each wild as pal, index (index)}
      <circle
        cx={pal.at.x}
        cy={pal.at.y}
        r={2.2 * k}
        fill={primaryColor(pal.species)}
        class="map-wild"
        role="presentation"
        onpointerenter={() =>
          (hovered = `${speciesInfo(pal.species)?.name ?? pal.name ?? pal.species}, level ${pal.level}`)}
        onpointerleave={() => (hovered = null)}
      />
    {/each}
    {#each deaths as death, index (index)}
      <g
        class="map-death"
        role="presentation"
        onpointerenter={() => (hovered = `${death.player.name} was knocked out here`)}
        onpointerleave={() => (hovered = null)}
      >
        <path
          d="M {death.at.x - 3.5 * k} {death.at.y - 3.5 * k} L {death.at.x + 3.5 * k} {death.at.y +
            3.5 * k} M {death.at.x + 3.5 * k} {death.at.y - 3.5 * k} L {death.at.x - 3.5 * k} {death
            .at.y +
            3.5 * k}"
          stroke-width={1.6 * k}
        />
      </g>
    {/each}
    {#if trailPath}
      <path d={trailPath} class="map-trail" stroke-width={2.2 * k} />
      {#if trailEnds}
        <circle cx={trailEnds.start.x} cy={trailEnds.start.y} r={3.5 * k} class="map-trail-start" />
        <circle cx={trailEnds.end.x} cy={trailEnds.end.y} r={4.5 * k} class="map-trail-end" />
      {/if}
    {/if}
    {#each bases as base (base.id)}
      <g
        class="map-base"
        role="presentation"
        onpointerenter={() =>
          (hovered = `${base.name ?? 'Base'}${base.guild ? `, ${base.guild.name}` : ''}, ${base.workers} workers`)}
        onpointerleave={() => (hovered = null)}
      >
        <rect
          x={base.at.x - 5 * k}
          y={base.at.y - 5 * k}
          width={10 * k}
          height={10 * k}
          rx={2.5 * k}
          fill={guildColor(base.guild?.id)}
          stroke="var(--color-surface-raised)"
          stroke-width={1.4 * k}
        />
        <circle cx={base.at.x} cy={base.at.y} r={2.2 * k} fill="var(--color-surface-raised)" />
      </g>
    {/each}
    {#each players as player (player.id)}
      <a href="/players/{player.id}" aria-label="{player.name}, level {player.level}">
        <g
          class="map-player"
          data-down={player.down ? 'true' : undefined}
          data-highlight={highlight === player.id ? 'true' : undefined}
          role="presentation"
          onpointerenter={() => (hovered = `${player.name}, level ${player.level}`)}
          onpointerleave={() => (hovered = null)}
        >
          <circle
            cx={player.at.x}
            cy={player.at.y}
            r={(highlight === player.id ? 10 : 8) * k}
            fill={guildColor(player.guild_id)}
            stroke="var(--color-surface-raised)"
            stroke-width={2 * k}
          />
          <text x={player.at.x} y={player.at.y + 3.4 * k} font-size={9 * k} class="map-initial"
            >{initialOf(player.name)}</text
          >
          {#if !compact}
            <text x={player.at.x} y={player.at.y - 12 * k} font-size={11 * k} class="map-name"
              >{player.name}</text
            >
          {/if}
        </g>
      </a>
    {/each}
  </svg>
  {#if !compact}
    <div class="absolute top-3 left-3 flex flex-col gap-1.5">
      <button type="button" class="map-ui" aria-label="Zoom in" onclick={() => nudge(1 / 1.5)}
        >+</button
      >
      <button type="button" class="map-ui" aria-label="Zoom out" onclick={() => nudge(1.5)}
        >−</button
      >
      <button type="button" class="map-ui" aria-label="Show the whole map" onclick={reset}>⤢</button
      >
    </div>
    <div class="absolute top-3 right-3 flex gap-1.5">
      <button
        type="button"
        class="map-ui px-2.5"
        aria-pressed={mapId === 'MainMap'}
        onclick={() => {
          mapId = 'MainMap';
          reset();
        }}>Palpagos</button
      >
      <button
        type="button"
        class="map-ui px-2.5"
        aria-pressed={mapId === 'Tree'}
        onclick={() => {
          mapId = 'Tree';
          reset();
        }}>World Tree</button
      >
    </div>
    <p class="map-caption">
      {#if hovered}
        {hovered}
      {:else if elsewhere.length > 0}
        {elsewhere.length} on the {mapId === 'MainMap' ? 'World Tree map' : 'Palpagos map'}
      {:else}
        Drag to pan, scroll to zoom
      {/if}
    </p>
  {/if}
</div>

<p class="sr-only">
  {#each players as player (player.id)}{player.name} at {formatDisplay(player.x, player.y)}.
  {/each}
</p>
