import { privateJson } from '$lib/server/http/respond';
import { adminGet, adminMutation, readJsonBody } from '$lib/server/http/routes';
import { parseSettingsUpdate, siteSettings } from '$lib/server/settings';

export const GET = adminGet(() => siteSettings.read());

export const PUT = adminMutation(async (event) =>
  privateJson(await siteSettings.write(parseSettingsUpdate(await readJsonBody(event))))
);
