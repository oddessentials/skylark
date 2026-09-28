import { browser } from '$app/environment';

class Clock {
  now = $state(Date.now());
  local = $state(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): () => void {
    this.local = true;
    this.now = Date.now();
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.now = Date.now();
      }, 30_000);
    }
    return () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    };
  }
}

export const clock = new Clock();

export function currentTime(): number {
  return browser ? clock.now : Date.now();
}
