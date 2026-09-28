import { ApiError } from '$lib/api/client';

export interface LoadFailure {
  code: string;
  message: string;
  status: number;
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: LoadFailure };

export async function attempt<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        error: { code: error.code, message: error.message, status: error.status }
      };
    }
    return {
      ok: false,
      error: {
        code: 'unavailable',
        message: error instanceof Error ? error.message : String(error),
        status: 0
      }
    };
  }
}

export interface Section {
  title: string;
  endpoint: string;
  result: Loaded<unknown>;
}

export function section(title: string, endpoint: string, result: Loaded<unknown>): Section {
  return { title, endpoint, result };
}
