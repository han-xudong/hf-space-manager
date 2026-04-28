import { ActionStatus, ActionType } from "@prisma/client";

import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { enqueueWorkspaceSyncJobs } from "../lib/jobs/queue";
import { JOB_POLL_INTERVAL_MS, processAvailableJobs } from "../lib/jobs/processor";

async function processPendingJobs() {
  await processAvailableJobs();
}

async function processDueWakePolicies() {
  const dueBy = new Date(Date.now() + env.HF_WAKE_LOOKAHEAD_SECONDS * 1000);
  const duePolicies = await prisma.wakePolicy.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: dueBy },
    },
    orderBy: { nextRunAt: "asc" },
    take: 20,
  });

  for (const policy of duePolicies) {
    await prisma.$transaction(async (tx) => {
      const currentPolicy = await tx.wakePolicy.findUnique({
        where: { id: policy.id },
      });

      if (!currentPolicy || !currentPolicy.enabled || currentPolicy.nextRunAt > dueBy) {
        return;
      }

      const existingJob = await tx.actionJob.findFirst({
        where: {
          wakePolicyId: currentPolicy.id,
          status: { in: [ActionStatus.PENDING, ActionStatus.RUNNING] },
        },
      });

      if (existingJob) {
        return;
      }

      const nextRunBase = Math.max(currentPolicy.nextRunAt.getTime(), Date.now());
      await tx.wakePolicy.update({
        where: { id: currentPolicy.id },
        data: {
          nextRunAt: new Date(nextRunBase + currentPolicy.intervalMinutes * 60_000),
        },
      });

      await tx.actionJob.create({
        data: {
          trackedSpaceId: currentPolicy.trackedSpaceId,
          wakePolicyId: currentPolicy.id,
          type: ActionType.RESTART,
          reason: "scheduled wake",
          availableAt: new Date(),
        },
      });
    });
  }
}

async function processWorkspaceSync() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } });

  for (const workspace of workspaces) {
    await enqueueWorkspaceSyncJobs({
      workspaceId: workspace.id,
      createdById: null,
      reason: "scheduled sync",
    });
  }

  await processPendingJobs();
}

async function runCycle() {
  try {
    await processPendingJobs();
    await processDueWakePolicies();
  } catch (error) {
    console.error("[worker] cycle failed", error);
  }
}

async function main() {
  console.log("[worker] starting hf-space-manager worker");
  await runCycle();
  try {
    await processWorkspaceSync();
  } catch (error) {
    console.error("[worker] initial workspace sync failed", error);
  }

  const jobInterval = setInterval(() => {
    void runCycle();
  }, JOB_POLL_INTERVAL_MS);

  const syncInterval = setInterval(() => {
    void processWorkspaceSync().catch((error) => {
      console.error("[worker] scheduled workspace sync failed", error);
    });
  }, env.HF_SYNC_INTERVAL_SECONDS * 1000);

  const shutdown = async () => {
    clearInterval(jobInterval);
    clearInterval(syncInterval);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main();