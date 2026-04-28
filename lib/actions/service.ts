import { ActionStatus, ActionType, MembershipRole, Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSpaceDetails, listOwnedSpaces, restartSpace } from "@/lib/hf/client";
import { getRetryAt, releaseActionJobClaim, retryActionJob, SYNC_MAX_ATTEMPTS } from "@/lib/jobs/queue";
import { hasRequiredRole } from "@/lib/rbac";
import { publishWorkspaceUpdate } from "@/lib/realtime/events";
import { notifyWorkspaceUpdate } from "@/lib/realtime/notify";
import { decryptSecret } from "@/lib/security/crypto";
import { getCanonicalRepoId, isCanonicalRepoId } from "@/lib/spaces/identity";

function emitWorkspaceUpdate(workspaceId: string) {
  publishWorkspaceUpdate(workspaceId);
  void notifyWorkspaceUpdate(workspaceId);
}

const TRANSITIONAL_IDLE_STAGES = new Set(["PAUSED", "STOPPED", "SLEEPING"]);

async function resolveTrackedSpaceRepoId(input: {
  trackedSpaceId: string;
  repoId: string;
  name: string;
  subdomain?: string | null;
  ownerUsername: string;
  token: string;
}) {
  const initialRepoId = getCanonicalRepoId({
    repoId: input.repoId,
    name: input.name,
    subdomain: input.subdomain,
    ownerUsername: input.ownerUsername,
  });

  if (isCanonicalRepoId(initialRepoId)) {
    return initialRepoId;
  }

  const ownedSpaces = await listOwnedSpaces(input.token, input.ownerUsername);
  const matchedSpace = ownedSpaces.find((space) => {
    const rawSpaceId = typeof space.rawPayload.id === "string" ? space.rawPayload.id : null;

    return (
      space.repoId === input.repoId ||
      rawSpaceId === input.repoId ||
      space.name === input.name ||
      (input.subdomain != null && input.subdomain === space.subdomain)
    );
  });

  if (!matchedSpace) {
    throw new Error(`Unable to resolve canonical Hugging Face Space ID for ${input.repoId}.`);
  }

  await prisma.trackedSpace.update({
    where: { id: input.trackedSpaceId },
    data: {
      repoId: matchedSpace.repoId,
      name: matchedSpace.name,
      subdomain: matchedSpace.subdomain,
    },
  });

  return matchedSpace.repoId;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshTrackedSpaceState(input: {
  trackedSpaceId: string;
  repoId: string;
  token: string;
  previousStage: string | null;
  reason: string | null;
}) {
  let details = await getSpaceDetails(input.token, input.repoId);

  if (input.previousStage && TRANSITIONAL_IDLE_STAGES.has(input.previousStage)) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (details.stage !== input.previousStage && !TRANSITIONAL_IDLE_STAGES.has(details.stage ?? "")) {
        break;
      }

      await wait(1_000);
      details = await getSpaceDetails(input.token, input.repoId);
    }
  }

  await prisma.trackedSpace.update({
    where: { id: input.trackedSpaceId },
    data: {
      repoId: details.repoId,
      name: details.name,
      subdomain: details.subdomain,
      sdk: details.sdk,
      visibility: details.visibility,
      stage: details.stage,
      hardware: details.hardware,
      requestedHardware: details.requestedHardware,
      sleepTimeSeconds: details.sleepTimeSeconds,
      lastModifiedAt: details.lastModifiedAt,
      lastSyncedAt: new Date(),
      lastWakeAt: input.reason === "scheduled wake" ? new Date() : undefined,
      lastActionAt: new Date(),
    },
  });

  await prisma.spaceSnapshot.create({
    data: {
      trackedSpaceId: input.trackedSpaceId,
      stage: details.stage,
      hardware: details.hardware,
      requestedHardware: details.requestedHardware,
      sleepTimeSeconds: details.sleepTimeSeconds,
      rawPayload: details.rawPayload as Prisma.InputJsonValue,
    },
  });
}

export async function requireTrackedSpaceAccess(userId: string, workspaceId: string, minimumRole: MembershipRole) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
  });

  if (!membership || !hasRequiredRole(membership.role, minimumRole)) {
    throw new Error("Forbidden.");
  }

  return membership;
}

export async function enqueueSpaceAction(input: {
  trackedSpaceId: string;
  createdById: string | null;
  type: ActionType;
  reason?: string;
  availableAt?: Date;
  wakePolicyId?: string;
}) {
  const trackedSpace = await prisma.trackedSpace.findUnique({
    where: { id: input.trackedSpaceId },
  });

  if (!trackedSpace) {
    throw new Error("Tracked space not found.");
  }

  const job = await prisma.actionJob.create({
    data: {
      trackedSpaceId: trackedSpace.id,
      createdById: input.createdById,
      type: input.type,
      reason: input.reason,
      availableAt: input.availableAt,
      wakePolicyId: input.wakePolicyId,
    },
  });

  await writeAuditLog({
    workspaceId: trackedSpace.workspaceId,
    actorUserId: input.createdById,
    event: "action.requested",
    targetType: "tracked_space",
    targetId: trackedSpace.id,
    metadata: { actionType: input.type, jobId: job.id },
  });

  return job;
}

export async function updateWakePolicy(input: {
  trackedSpaceId: string;
  workspaceId: string;
  intervalMinutes: number;
}) {
  const nextRunAt = new Date(Date.now() + input.intervalMinutes * 60_000);

  return prisma.wakePolicy.upsert({
    where: { trackedSpaceId: input.trackedSpaceId },
    update: {
      enabled: true,
      intervalMinutes: input.intervalMinutes,
      nextRunAt,
    },
    create: {
      workspaceId: input.workspaceId,
      trackedSpaceId: input.trackedSpaceId,
      intervalMinutes: input.intervalMinutes,
      nextRunAt,
    },
  });
}

export async function processPendingActionJob(jobId: string) {
  const job = await prisma.actionJob.findUnique({
    where: { id: jobId },
    include: {
      trackedSpace: {
        include: {
          hfAccount: true,
        },
      },
      wakePolicy: true,
    },
  });

  if (!job || job.status !== ActionStatus.RUNNING) {
    return null;
  }

  const token = decryptSecret({
    ciphertext: job.trackedSpace.hfAccount.tokenCiphertext,
    iv: job.trackedSpace.hfAccount.tokenIv,
    authTag: job.trackedSpace.hfAccount.tokenAuthTag,
    fingerprint: "",
  });

  try {
    const canonicalRepoId = await resolveTrackedSpaceRepoId({
      trackedSpaceId: job.trackedSpace.id,
      repoId: job.trackedSpace.repoId,
      name: job.trackedSpace.name,
      subdomain: job.trackedSpace.subdomain,
      ownerUsername: job.trackedSpace.hfAccount.username,
      token,
    });

    if (job.type === ActionType.RESTART) {
      await restartSpace(token, canonicalRepoId, false);
    } else if (job.type === ActionType.REBUILD) {
      await restartSpace(token, canonicalRepoId, true);
    } else if (job.type === ActionType.SYNC) {
      await refreshTrackedSpaceState({
        trackedSpaceId: job.trackedSpaceId,
        repoId: canonicalRepoId,
        token,
        previousStage: job.trackedSpace.stage,
        reason: job.reason,
      });
    }

    if (job.type !== ActionType.SYNC) {
      await refreshTrackedSpaceState({
        trackedSpaceId: job.trackedSpaceId,
        repoId: canonicalRepoId,
        token,
        previousStage: job.trackedSpace.stage,
        reason: job.reason,
      });
    }

    await releaseActionJobClaim(job.id, {
      status: ActionStatus.SUCCEEDED,
      lastError: null,
    });

    if (job.wakePolicyId) {
      await prisma.wakePolicy.update({
        where: { id: job.wakePolicyId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: "SUCCEEDED",
        },
      });
    }

    await writeAuditLog({
      workspaceId: job.trackedSpace.workspaceId,
      actorUserId: job.createdById,
      event: "action.completed",
      targetType: "tracked_space",
      targetId: job.trackedSpaceId,
      metadata: { actionType: job.type, jobId: job.id },
    });

    emitWorkspaceUpdate(job.trackedSpace.workspaceId);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (job.type === ActionType.SYNC && job.attemptCount < SYNC_MAX_ATTEMPTS) {
      await retryActionJob(job.id, {
        availableAt: getRetryAt(job.attemptCount),
        lastError: errorMessage,
      });

      await writeAuditLog({
        workspaceId: job.trackedSpace.workspaceId,
        actorUserId: job.createdById,
        event: "action.retry_scheduled",
        targetType: "tracked_space",
        targetId: job.trackedSpaceId,
        metadata: {
          actionType: job.type,
          jobId: job.id,
          error: errorMessage,
          attemptCount: job.attemptCount,
        },
      });

      emitWorkspaceUpdate(job.trackedSpace.workspaceId);

      return { success: false, retrying: true };
    }

    await releaseActionJobClaim(job.id, {
      status: ActionStatus.FAILED,
      lastError: errorMessage,
    });

    if (job.wakePolicyId) {
      await prisma.wakePolicy.update({
        where: { id: job.wakePolicyId },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: errorMessage,
        },
      });
    }

    await writeAuditLog({
      workspaceId: job.trackedSpace.workspaceId,
      actorUserId: job.createdById,
      event: "action.failed",
      targetType: "tracked_space",
      targetId: job.trackedSpaceId,
      metadata: {
        actionType: job.type,
        jobId: job.id,
        error: errorMessage,
      },
    });

    emitWorkspaceUpdate(job.trackedSpace.workspaceId);

    throw error;
  }
}