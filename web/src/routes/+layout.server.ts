import { attempt } from '$lib/ui/load';
import { navigationFor } from '$lib/ui/navigation';
import { serverApi } from '$lib/ui/server';
import type { LayoutServerLoad } from './$types';

const defaultSiteName = 'Palworld server';

export const load: LayoutServerLoad = async ({ fetch, url }) => {
  const server = serverApi(fetch, url);
  const [status, site] = await Promise.all([
    attempt(server.api.getStatus()),
    attempt(server.api.getSite())
  ]);
  const features = site.ok ? site.data.features : null;
  return {
    siteName: site.ok ? site.data.name : defaultSiteName,
    version: site.ok ? site.data.version : null,
    features,
    status: status.ok ? status.data : null,
    statusError: status.ok ? null : status.error,
    streamEnabled: !server.external,
    navigation: navigationFor(features)
  };
};
