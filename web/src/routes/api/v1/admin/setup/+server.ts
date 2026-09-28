import type { RequestHandler } from '@sveltejs/kit';
import { createSession, isSecureSite, requireSameOrigin } from '$lib/server/auth/admin';
import { parseNewPassword, secrets } from '$lib/server/auth/secrets';
import { empty, errorResponse, guarded } from '$lib/server/http/respond';
import { loginRateLimiter } from '$lib/server/http/rateLimit';
import { clientAddress, readJsonBody } from '$lib/server/http/routes';

export const POST: RequestHandler = (event) =>
  guarded(async () => {
    if (!loginRateLimiter.allow(clientAddress(event))) {
      return errorResponse(
        429,
        'rate_limited',
        'more than 5 attempts per minute from this address'
      );
    }
    requireSameOrigin(event);
    if ((await secrets.passwordSource()) !== 'unset') {
      return errorResponse(409, 'conflict', 'the admin password is already set');
    }
    const password = parseNewPassword(await readJsonBody(event));
    if (!(await secrets.setInitialPassword(password))) {
      return errorResponse(409, 'conflict', 'the admin password is already set');
    }
    const session = await createSession(isSecureSite(event));
    return empty(204, { 'set-cookie': session.setCookie });
  });
