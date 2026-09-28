import type { RequestHandler } from '@sveltejs/kit';
import { readSession } from '$lib/server/auth/admin';
import { secrets } from '$lib/server/auth/secrets';
import { guarded, privateJson } from '$lib/server/http/respond';

export const GET: RequestHandler = (event) =>
  guarded(async () => {
    const session = await readSession(event);
    return privateJson({
      authenticated: session.authenticated,
      expires_at: session.expiresAt ? session.expiresAt.toISOString() : null,
      setup_required: (await secrets.passwordSource()) === 'unset'
    });
  });
