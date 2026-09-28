import type { Handle } from '@sveltejs/kit';

export const watchPath = '/watch';

export const watchPage: Handle = async ({ event, resolve }) => {
  if (event.url.pathname !== watchPath) return resolve(event);
  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace('<html lang="en">', '<html lang="en" data-watch>')
  });
};
