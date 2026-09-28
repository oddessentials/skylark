import type { Handle } from '@sveltejs/kit';
import { env } from '../env';
import { answerFromFixtures } from '../mock/router';

export const mock: Handle = async ({ event, resolve }) => {
  if (!env.apiMock) return resolve(event);
  const response = await answerFromFixtures(event);
  return response ?? resolve(event);
};
