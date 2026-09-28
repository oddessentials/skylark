import type { components } from '$lib/api/types';

type Schemas = components['schemas'];

export type BusEvent =
  | { channel: 'status'; data: Schemas['Status'] }
  | { channel: 'online'; data: Schemas['OnlineList'] }
  | { channel: 'map'; data: Schemas['MapState'] }
  | { channel: 'activity'; id: string | null; data: Schemas['ActivityItem'] };

export type BusListener = (event: BusEvent) => void;

export interface EventBus {
  publish(event: BusEvent): void;
  subscribe(listener: BusListener): () => void;
  listenerCount(): number;
}

export function createBus(): EventBus {
  const listeners = new Set<BusListener>();
  return {
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('bus listener failed', error);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size
  };
}

export const bus: EventBus = createBus();
