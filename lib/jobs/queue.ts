import crypto from "node:crypto";

import { ActionStatus, ActionType } from "@prisma/client";

import { prisma } from "@/lib/db";

const defaultWorkerId = `${process.pid}-${crypto.randomUUID()}`;
export const SYNC_MAX_ATTEMPTS = 3;

type ClaimOptions = {
  workerId?: string;
  leaseMs?: number;
};

type LatestSyncJobState = {
  trackedSpaceId: string;
  status: ActionStatus;
  id: string;
};

export function createWorkerId(prefix = "worker") {
  return `${prefix}-${process.pid}-${crypto.randomUUID()}`;
}

export function getRetryDelayMs(attemptCount: number) {
  return Math.min(60_000, Math.max(5_000, 2 ** Math.max(0, attemptCount - 1) * 5_000));
}

export function getRetryAt(attemptCount: number) {
  return new Date(Date.now() + getRetryDelayMs(attemptCount));
}

function getClaimData(options?: ClaimOptions) {
  const startedAt = new Date();

  return {
    workerId: options?.workerId ?? defaultWorkerId,
    startedAt,
    leaseExpiresAt: new Date(startedAt.getTime() + (options?.leaseMs ?? 30_000)),
  };
}

export async function claimActionJob(jobId: string, options?: ClaimOptions) {
  const claimData = getClaimData(options);

  const updated = await prisma.actionJob.updateMany({
    where: {
      id: jobId,
      availableAt: { lte: claimData.startedAt },
      OR: [
        { status: ActionStatus.PENDING },
        {
          status: ActionStatus.RUNNING,
          leaseExpiresAt: { lt: claimData.startedAt },
        },
      ],
    },
    data: {
      status: ActionStatus.RUNNING,
      workerId: claimData.workerId,
      startedAt: claimData.startedAt,
      leaseExpiresAt: claimData.leaseExpiresAt,
      attemptCount: { increment: 1 },
      finishedAt: null,
    },
  });

  if (updated.count === 0) {
    return null;
  }

  return prisma.actionJob.findUnique({ where: { id: jobId } });
}

export async function claimDueActionJobs(limit: number, options?: ClaimOptions) {
  const now = new Date();
  const candidates = await prisma.actionJob.findMany({
    where: {
      availableAt: { lte: now },
      OR: [
        { status: ActionStatus.PENDING },
        {
          status: ActionStatus.RUNNING,
          leaseExpiresAt: { lt: now },
        },
      ],
    },
    orderBy: [{ availableAt: "asc" }, { requestedAt: "asc" }],
    take: limit,
    select: { id: true },
  });

  const claimed = [];

  for (const candidate of candidates) {
    const job = await claimActionJob(candidate.id, options);

    if (job) {
      claimed.push(job);
    }
  }

  return claimed;
}

export async function releaseActionJobClaim(jobId: string, data: {
  status: ActionStatus;
  lastError?: string | null;
}) {
  return prisma.actionJob.update({
    where: { id: jobId },
    data: {
      status: data.status,
      lastError: data.lastError ?? null,
      finishedAt: new Date(),
      workerId: null,
      leaseExpiresAt: null,
    },
  });
}

export async function retryActionJob(jobId: string, input: { availableAt: Date; lastError: string | null }) {
  return prisma.actionJob.update({
    where: { id: jobId },
    data: {
      status: ActionStatus.PENDING,
      availableAt: input.availableAt,
      lastError: input.lastError,
      workerId: null,
      leaseExpiresAt: null,
      finishedAt: null,
    },
  });
}

async function getLatestSyncJobState(trackedSpaceIds: string[]) {
  if (trackedSpaceIds.length === 0) {
    return new Map<string, LatestSyncJobState>();
  }

  const syncJobs = await prisma.actionJob.findMany({
    where: {
      type: ActionType.SYNC,
      trackedSpaceId: { in: trackedSpaceIds },
    },
    orderBy: [{ requestedAt: "desc" }],
    select: {
      id: true,
      trackedSpaceId: true,
      status: true,
    },
  });

  const latestSyncJobs = new Map<string, LatestSyncJobState>();

  for (const job of syncJobs) {
    if (!latestSyncJobs.has(job.trackedSpaceId)) {
      latestSyncJobs.set(job.trackedSpaceId, job);
    }
  }

  return latestSyncJobs;
}

export async function enqueueTrackedSpaceSyncJob(input: {
  trackedSpaceId: string;
  createdById?: string | null;
  reason?: string;
}) {
  const latestSyncJob = (await getLatestSyncJobState([input.trackedSpaceId])).get(input.trackedSpaceId) ?? null;

  if (latestSyncJob && (latestSyncJob.status === ActionStatus.PENDING || latestSyncJob.status === ActionStatus.RUNNING)) {
    const existingJob = await prisma.actionJob.findUnique({ where: { id: latestSyncJob.id } });

    if (existingJob) {
      return { job: existingJob, created: false };
    }
  }

  const job = await prisma.actionJob.create({
    data: {
      trackedSpaceId: input.trackedSpaceId,
      createdById: input.createdById ?? null,
      type: ActionType.SYNC,
      reason: input.reason ?? "manual sync",
      availableAt: new Date(),
    },
  });

  return { job, created: true };
}

export async function enqueueWorkspaceSyncJobs(input: { workspaceId: string; createdById?: string | null; reason?: string }) {
  const trackedSpaces = await prisma.trackedSpace.findMany({
    where: { workspaceId: input.workspaceId, enabled: true },
    select: { id: true },
  });

  const latestSyncJobs = await getLatestSyncJobState(trackedSpaces.map((space) => space.id));
  const trackedSpaceIdsWithOpenSyncJob = new Set(
    Array.from(latestSyncJobs.values())
      .filter((job) => job.status === ActionStatus.PENDING || job.status === ActionStatus.RUNNING)
      .map((job) => job.trackedSpaceId),
  );
  const jobsToCreate = trackedSpaces
    .filter((trackedSpace) => !trackedSpaceIdsWithOpenSyncJob.has(trackedSpace.id))
    .map((trackedSpace) => ({
      trackedSpaceId: trackedSpace.id,
      createdById: input.createdById ?? null,
      type: ActionType.SYNC,
      reason: input.reason ?? "dashboard sync",
      availableAt: new Date(),
    }));

  if (jobsToCreate.length > 0) {
    await prisma.actionJob.createMany({ data: jobsToCreate });
  }

  return {
    queuedTrackedSpaceIds: jobsToCreate.map((job) => job.trackedSpaceId),
    skippedTrackedSpaceIds: trackedSpaces
      .filter((trackedSpace) => trackedSpaceIdsWithOpenSyncJob.has(trackedSpace.id))
      .map((trackedSpace) => trackedSpace.id),
  };
}