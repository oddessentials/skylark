import type { RequestHandler } from '@sveltejs/kit';
import {
  clearedCookie,
  destroySession,
  isSecureSite,
  requireAdmin,
  requireSameOrigin
} from '$lib/server/auth/admin';
import { empty, guarded } from '$lib/server/http/respond';

export const POST: RequestHandler = (event) =>
  guarded(async () => {
    const session = await requireAdmin(event);
    requireSameOrigin(event);
    await destroySession(session.id);
    return empty(204, { 'set-cookie': clearedCookie(isSecureSite(event)) });
  });
