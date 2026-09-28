import { redirect } from '@sveltejs/kit';
import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { LayoutServerLoad } from './$types';

const openPaths = new Set(['/admin/login', '/admin/setup']);

export const load: LayoutServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const session = await attempt(api.getAdminSession());
  const authenticated = session.ok && session.data.authenticated;
  const setupRequired = session.ok && session.data.setup_required;
  if (setupRequired && url.pathname !== '/admin/setup') redirect(303, '/admin/setup');
  if (!setupRequired && url.pathname === '/admin/setup') {
    redirect(303, authenticated ? '/admin' : '/admin/login');
  }
  if (!authenticated && !openPaths.has(url.pathname)) redirect(303, '/admin/login');
  return {
    authenticated,
    setupRequired,
    expiresAt: session.ok ? session.data.expires_at : null,
    sessionError: session.ok ? null : session.error
  };
};
