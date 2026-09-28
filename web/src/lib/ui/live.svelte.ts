import { getContext, setContext } from 'svelte';
import { connectStream, type StreamConnection, type StreamState } from '$lib/api/sse';
import type { ActivityItem, MapState, OnlineList, Status } from '$lib/api/types';
import { upsertActivity } from './activity';

export type LiveStreamState = StreamState | 'off';

export class LiveState {
  status = $state<Status | null>(null);
  online = $state<OnlineList | null>(null);
  map = $state<MapState | null>(null);
  activity = $state<ActivityItem[]>([]);
  stream = $state<LiveStreamState>('off');
  private connection: StreamConnection | null = null;

  start(): void {
    if (this.connection) return;
    this.connection = connectStream({
      onStatus: (status) => {
        this.status = status;
      },
      onOnline: (online) => {
        this.online = online;
      },
      onMap: (map) => {
        this.map = map;
      },
      onActivity: (item) => {
        this.push(item);
      },
      onState: (state) => {
        this.stream = state;
      }
    });
    this.stream = this.connection.state;
  }

  stop(): void {
    this.connection?.close();
    this.connection = null;
    this.stream = 'off';
  }

  private push(item: ActivityItem): void {
    this.activity = upsertActivity(this.activity, item, 200);
  }
}

const key = Symbol('live');

export function provideLive(): LiveState {
  const live = new LiveState();
  setContext(key, live);
  return live;
}

export function useLive(): LiveState {
  return getContext<LiveState>(key);
}
