import { secrets } from '$lib/server/auth/secrets';
import { privateJson } from '$lib/server/http/respond';
import { adminMutation } from '$lib/server/http/routes';

export const POST = adminMutation(async () =>
  privateJson({ secret: await secrets.regenerateCollectorSecret() })
);
