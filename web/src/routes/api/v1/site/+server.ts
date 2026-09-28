import type { RequestHandler } from '@sveltejs/kit';
import type { Site } from '$lib/api/types';
import { guarded, publicJson } from '$lib/server/http/respond';
import { siteSettings } from '$lib/server/settings';

export const GET: RequestHandler = (event) =>
  guarded(async () => {
    const settings = await siteSettings.read();
    const site: Site = {
      name: settings.site_name,
      version: __APP_VERSION__,
      features: settings.features
    };
    return publicJson(site, event.request);
  });
