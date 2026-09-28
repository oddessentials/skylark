import { browser } from '$app/environment';
import type { SceneryStatus } from './scenery';

const storageKey = 'skylark-atmosphere';

export class AtmosphereState {
  enabled = $state(true);
  reducedMotion = $state(false);
  compact = $state(true);
  constrained = $state(false);
  ready = $state(false);
  suspended = $state(0);
  status = $state<SceneryStatus>('still');
  available = $derived(this.ready && !this.reducedMotion && !this.compact && !this.constrained);
  active = $derived(this.available && this.enabled && this.suspended === 0);

  start(): () => void {
    if (!browser) return () => {};
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const compact = matchMedia('(max-width: 767px)');
    const device = navigator as Navigator & {
      deviceMemory?: number;
      connection?: EventTarget & { saveData?: boolean };
    };
    const update = () => {
      this.reducedMotion = motion.matches;
      this.compact = compact.matches;
      this.constrained =
        device.connection?.saveData === true ||
        (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
        (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2);
    };
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) this.enabled = event.newValue !== 'off';
    };
    try {
      this.enabled = localStorage.getItem(storageKey) !== 'off';
    } catch {
      this.enabled = true;
    }
    update();
    this.ready = true;
    motion.addEventListener('change', update);
    compact.addEventListener('change', update);
    device.connection?.addEventListener('change', update);
    window.addEventListener('storage', sync);
    return () => {
      this.ready = false;
      motion.removeEventListener('change', update);
      compact.removeEventListener('change', update);
      device.connection?.removeEventListener('change', update);
      window.removeEventListener('storage', sync);
    };
  }

  toggle(): void {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(storageKey, this.enabled ? 'on' : 'off');
    } catch {
      return;
    }
  }

  suspend(): () => void {
    this.suspended += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.suspended -= 1;
    };
  }
}

export const atmosphere = new AtmosphereState();
