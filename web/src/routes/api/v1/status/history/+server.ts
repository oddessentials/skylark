import { parseEnum } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { historyRanges, statusHistory } from '$lib/server/read/history';

export const GET = publicGet(async ({ url }, db) =>
  statusHistory(db, parseEnum(url, 'range', historyRanges, '24h'))
);
