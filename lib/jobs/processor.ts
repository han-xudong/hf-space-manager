import { ActionType } from "@prisma/client";

import { processPendingActionJob } from "@/lib/actions/service";
import { claimDueActionJobs } from "@/lib/jobs/queue";

export const JOB_POLL_INTERVAL_MS = 2_000;
export const SYNC_CONCURRENCY_LIMIT = 4;
const CLAIM_BATCH_SIZE = 12;

async function processClaimedJob(jobId: string) {
  try {
    await processPendingActionJob(jobId);
  } catch (error) {
    console.error(`[jobs] job ${jobId} failed`, error);
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const workerCount = Math.min(Math.max(limit, 1), queue.length);

  if (workerCount === 0) {
    return;
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const nextItem = queue.shift();

        if (!nextItem) {
          return;
        }

        await worker(nextItem);
      }
    }),
  );
}

export async function processAvailableJobs(input?: { claimLimit?: number; syncConcurrency?: number }) {
  const jobs = await claimDueActionJobs(input?.claimLimit ?? CLAIM_BATCH_SIZE);
  const syncJobs = jobs.filter((job) => job.type === ActionType.SYNC);
  const otherJobs = jobs.filter((job) => job.type !== ActionType.SYNC);

  // Favor sync jobs so user-visible refreshes complete before slower operational actions.
  await runWithConcurrency(syncJobs, input?.syncConcurrency ?? SYNC_CONCURRENCY_LIMIT, async (job) => {
    await processClaimedJob(job.id);
  });

  for (const job of otherJobs) {
    await processClaimedJob(job.id);
  }

  return {
    processedCount: jobs.length,
    syncCount: syncJobs.length,
    otherCount: otherJobs.length,
  };
}