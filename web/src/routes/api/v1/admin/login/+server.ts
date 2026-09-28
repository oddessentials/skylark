import type { RequestHandler } from '@sveltejs/kit';
import { createSession, isSecureSite } from '$lib/server/auth/admin';
import { secrets } from '$lib/server/auth/secrets';
import { empty, errorResponse, guarded } from '$lib/server/http/respond';
import { loginRateLimiter } from '$lib/server/http/rateLimit';
import { clientAddress, readJsonBody } from '$lib/server/http/routes';

export const POST: RequestHandler = (event) =>
  guarded(async () => {
    if (!loginRateLimiter.allow(clientAddress(event))) {
      return errorResponse(
        429,
        'rate_limited',
        'more than 5 login attempts per minute from this address'
      );
    }
    const body = (await readJsonBody(event)) as { password?: unknown } | undefined;
    if (!body || typeof body !== 'object' || typeof body.password !== 'string') {
      return errorResponse(400, 'bad_request', 'password is required');
    }
    if ((await secrets.passwordSource()) === 'unset') {
      return errorResponse(409, 'conflict', 'set the admin password first');
    }
    if (!(await secrets.verifyPassword(body.password)))
      return errorResponse(401, 'unauthorized', 'wrong password');
    const session = await createSession(isSecureSite(event));
    return empty(204, { 'set-cookie': session.setCookie });
  });
