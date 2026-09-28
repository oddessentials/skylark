<script lang="ts">
  import type { Status } from '$lib/api/types';
  import { dawnMinute, duskMinute, minutesPerDay } from '$lib/world/clock';
  import { formatNumber } from './format';
  import { clockNote, phaseLabel } from './sunclock';
  import { worldClock } from './worldclock.svelte';

  let { status }: { status: Status | null } = $props();

  const reading = $derived(worldClock.reading(status));
  const sun = $derived(reading ? reading.minute / minutesPerDay : 0);
  const angle = $derived(sun * 360);
  const sunlight = $derived(reading ? daylight(sun) : 0);
  const note = $derived(
    reading ? clockNote(reading) : 'The collector has not reported the in-game clock yet'
  );
  const label = $derived(
    reading
      ? `In-game clock: day ${formatNumber(reading.day)}, ${reading.clock}, ${phaseLabel(reading.phase)}, ${note}`
      : `In-game clock: ${note}`
  );

  const dawnFraction = dawnMinute / minutesPerDay;
  const duskFraction = duskMinute / minutesPerDay;
  const dawnDegrees = dawnFraction * 360;
  const duskDegrees = duskFraction * 360;
  const trackRadius = 318;
  const markerRadius = 331;
  const numeralRadius = 252;
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const numerals = [0, 3, 6, 9, 12, 15, 18, 21].map((hour) => ({
    hour: hour === 0 ? 24 : hour,
    angle: hour * 15
  }));

  function point(degrees: number, radius: number): { x: number; y: number } {
    const radians = (degrees * Math.PI) / 180;
    return { x: 500 - radius * Math.sin(radians), y: 500 + radius * Math.cos(radians) };
  }

  function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function daylight(fraction: number): number {
    const blend = 0.02;
    const rise = smoothstep(dawnFraction - blend, dawnFraction + blend, fraction);
    const set = 1 - smoothstep(duskFraction - blend, duskFraction + blend, fraction);
    return Math.min(rise, set);
  }

  function arcPath(from: number, to: number, radius: number): string {
    const start = point(from, radius);
    const end = point(to, radius);
    const large = to - from > 180 ? 1 : 0;
    return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }

  const dayArc = arcPath(dawnDegrees, duskDegrees, trackRadius);
  const nightArc = arcPath(duskDegrees, dawnDegrees + 360, trackRadius);
  const dawnPoint = point(dawnDegrees, trackRadius);
  const duskPoint = point(duskDegrees, trackRadius);

  const remaining = $derived.by(() => {
    if (!reading) return null;
    const night = reading.phase === 'night';
    const to = night ? (angle >= duskDegrees ? dawnDegrees + 360 : dawnDegrees) : duskDegrees;
    return { d: arcPath(angle, to, trackRadius), night };
  });

  function tick(hour: number): string {
    const outer = point(hour * 15, 309);
    const inner = point(hour * 15, hour % 3 === 0 ? 289 : 298);
    return `M ${outer.x.toFixed(1)} ${outer.y.toFixed(1)} L ${inner.x.toFixed(1)} ${inner.y.toFixed(1)}`;
  }
</script>

<div
  class="sun-dial"
  data-state={reading?.state ?? 'unknown'}
  data-phase={reading?.phase ?? 'none'}
>
  <picture class="sun-dial-plate">
    <source
      type="image/avif"
      srcset="/art/dial-plate-512.avif 512w, /art/dial-plate-1024.avif 1024w"
      sizes="(min-width: 1024px) 340px, 320px"
    />
    <img
      src="/art/dial-plate-512.webp"
      srcset="/art/dial-plate-512.webp 512w, /art/dial-plate-1024.webp 1024w"
      sizes="(min-width: 1024px) 340px, 320px"
      width="1024"
      height="1024"
      alt=""
      decoding="async"
      fetchpriority="high"
    />
  </picture>
  <svg class="sun-dial-face" viewBox="0 0 1000 1000" aria-hidden="true">
    <defs>
      <radialGradient id="sun-dial-sunglow">
        <stop offset="0" stop-color="#ffd76a" stop-opacity="0.9" />
        <stop offset="0.45" stop-color="#ff8a2b" stop-opacity="0.35" />
        <stop offset="1" stop-color="#ff8a2b" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="sun-dial-moonglow">
        <stop offset="0" stop-color="#e6f0ff" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#8fb3e8" stop-opacity="0.3" />
        <stop offset="1" stop-color="#8fb3e8" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="sun-dial-well">
        <stop offset="0" stop-color="#fffdf6" stop-opacity="0.94" />
        <stop offset="0.72" stop-color="#fffdf6" stop-opacity="0.78" />
        <stop offset="1" stop-color="#fffdf6" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle cx="500" cy="500" r="340" class="sun-dial-sky-day" style="opacity: {sunlight * 0.2}" />
    <circle
      cx="500"
      cy="500"
      r="340"
      class="sun-dial-sky-night"
      style="opacity: {(1 - sunlight) * 0.24}"
    />
    <line
      x1={dawnPoint.x}
      y1={dawnPoint.y}
      x2={duskPoint.x}
      y2={duskPoint.y}
      class="sun-dial-horizon"
    />
    <path d={nightArc} class="sun-dial-arc-night" />
    <path d={dayArc} class="sun-dial-arc-day" />
    {#if remaining}
      <path
        d={remaining.d}
        class="sun-dial-remaining"
        data-night={remaining.night ? 'true' : undefined}
      />
    {/if}
    {#each hours as hour (hour)}
      <path d={tick(hour)} class="sun-dial-tick" data-major={hour % 3 === 0 ? 'true' : undefined} />
    {/each}
    {#each numerals as numeral (numeral.hour)}
      {@const at = point(numeral.angle, numeralRadius)}
      <text
        x={at.x.toFixed(1)}
        y={at.y.toFixed(1)}
        class="sun-dial-numeral"
        data-cardinal={numeral.hour % 6 === 0 ? 'true' : undefined}>{numeral.hour}</text
      >
    {/each}
    <circle cx="500" cy="500" r="235" fill="url(#sun-dial-well)" />
    {#if reading}
      <g transform="rotate({angle.toFixed(2)} 500 500)" class="sun-dial-marker">
        <g transform="translate(500 {500 + markerRadius}) rotate({(-angle).toFixed(2)})">
          <circle r="108" fill="url(#sun-dial-sunglow)" style="opacity: {sunlight}" />
          <circle r="92" fill="url(#sun-dial-moonglow)" style="opacity: {1 - sunlight}" />
          <image
            href="/art/sun-192.webp"
            x="-62"
            y="-62"
            width="124"
            height="124"
            style="opacity: {sunlight}"
          />
          <image
            href="/art/moon-192.webp"
            x="-54"
            y="-54"
            width="108"
            height="108"
            style="opacity: {1 - sunlight}"
          />
        </g>
      </g>
    {/if}
  </svg>
  <div class="sun-dial-readout" role="timer" aria-label={label}>
    {#if reading}
      <span class="sun-dial-day">Day {formatNumber(reading.day)}</span>
      <span class="sun-dial-time">{reading.clock}</span>
      <span class="sun-dial-phase">{phaseLabel(reading.phase)}</span>
      <span class="sun-dial-note">{note}</span>
    {:else}
      <span class="sun-dial-day">No clock</span>
      <span class="sun-dial-time">--:--</span>
      <span class="sun-dial-note">{note}</span>
    {/if}
  </div>
</div>
