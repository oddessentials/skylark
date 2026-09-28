import type { Handle } from '@sveltejs/kit';
import { errorResponse } from '../http/respond';
import { publicRateLimiter } from '../http/rateLimit';
import { clientAddress } from '../http/routes';

const exemptPrefixes = ['/api/v1/stream', '/api/v1/admin/', '/api/ingest'];

export const apiRateLimit: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  const limited =
    path.startsWith('/api/') && !exemptPrefixes.some((prefix) => path.startsWith(prefix));
  if (limited && !publicRateLimiter.allow(clientAddress(event))) {
    return errorResponse(
      429,
      'rate_limited',
      'more than 120 requests per minute from this address'
    );
  }
  return resolve(event);
};

export const apiNotFound: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  if (path.startsWith('/api/') && event.route.id === null) {
    return errorResponse(404, 'not_found', `${path} is not an API route`);
  }
  return resolve(event);
};
