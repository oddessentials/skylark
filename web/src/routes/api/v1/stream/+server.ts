import type { RequestHandler } from '@sveltejs/kit';
import { guarded } from '$lib/server/http/respond';
import { openStream } from '$lib/server/stream/sse';

export const GET: RequestHandler = ({ request }) => guarded(() => openStream(request));
