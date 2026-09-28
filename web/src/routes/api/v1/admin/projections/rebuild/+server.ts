import { privateJson } from '$lib/server/http/respond';
import { adminMutation } from '$lib/server/http/routes';
import { startJob } from '$lib/server/jobs/runner';

export const POST = adminMutation(async () => {
  const job = await startJob('projections_rebuild');
  return privateJson({ job_id: job.jobId }, 202);
});
