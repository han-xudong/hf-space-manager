import { ActionStatus, ActionType, MembershipRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { SYNC_MAX_ATTEMPTS } from "@/lib/jobs/queue";
import { decryptSecret } from "@/lib/security/crypto";
import { getCanonicalRepoId, getSpaceDisplayName } from "@/lib/spaces/identity";

export type DashboardSpace = {
  id: string;
  repoId: string;
  displayName: string;
  detailPath: string;
  name: string;
  subdomain: string | null;
  sdk: string | null;
  visibility: string;
  stage: string | null;
  hardware: string | null;
  requestedHardware: string | null;
  sleepTimeSeconds: number | null;
  lastSyncedAt: string | null;
  lastWakeAt: string | null;
  lastActionAt: string | null;
  connectionLabel: string;
  actionSummary: {
    pending: number;
    failed: number;
  };
  sync: {
    isUpdating: boolean;
    isQueued: boolean;
    status: ActionStatus | null;
    requestedAt: string | null;
    startedAt: string | null;
    availableAt: string | null;
    attemptCount: number;
    workerId: string | null;
    lastError: string | null;
    isDeadLetter: boolean;
  };
  wakePolicy: {
    enabled: boolean;
    intervalMinutes: number;
    nextRunAt: string | null;
  } | null;
};

export type DashboardJob = {
  id: string;
  trackedSpaceId: string;
  repoId: string;
  displayName: string;
  detailPath: string;
  type: string;
  status: ActionStatus;
  reason: string | null;
  attemptCount: number;
  availableAt: string;
  startedAt: string | null;
  workerId: string | null;
  isDeadLetter: boolean;
  requestedAt: string;
  finishedAt: string | null;
  lastError: string | null;
};

type DashboardTrackedSpace = Prisma.TrackedSpaceGetPayload<{
  include: {
    hfAccount: true;
    wakePolicies: true;
    actionJobs: true;
  };
}>;

type WorkspaceConnection = Prisma.HuggingFaceAccountGetPayload<{
  include: {
    trackedSpaces: {
      select: { id: true };
    };
  };
}>;

export type TrackedSpaceDetail = DashboardSpace & {
  jobs: DashboardJob[];
};

function toIso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function toSpaceDetailPath(repoId: string) {
  const [owner, repo] = repoId.split("/");

  if (!owner || !repo) {
    throw new Error(`Expected canonical repo id, received: ${repoId}`);
  }

  return `/spaces/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function maskToken(secret: string) {
  if (secret.length <= 10) {
    return secret;
  }

  return `${secret.slice(0, 6)}****${secret.slice(-4)}`;
}

function toDashboardSpace(space: DashboardTrackedSpace): DashboardSpace {
  const pending = space.actionJobs.filter((job) => job.type !== ActionType.SYNC && (job.status === ActionStatus.PENDING || job.status === ActionStatus.RUNNING)).length;
  const failed = space.actionJobs.filter((job) => job.type !== ActionType.SYNC && job.status === ActionStatus.FAILED).length;
  const latestSyncJob =
    space.actionJobs
      .filter((job) => job.type === ActionType.SYNC)
      .sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime())[0] ?? null;
  const policy = space.wakePolicies;
  const canonicalRepoId = getCanonicalRepoId({
    repoId: space.repoId,
    name: space.name,
    subdomain: space.subdomain,
    ownerUsername: space.hfAccount.username,
  });

  return {
    id: space.id,
    repoId: canonicalRepoId,
    displayName: getSpaceDisplayName({
      repoId: space.repoId,
      name: space.name,
      subdomain: space.subdomain,
      ownerUsername: space.hfAccount.username,
    }),
    detailPath: toSpaceDetailPath(canonicalRepoId),
    name: space.name,
    subdomain: space.subdomain,
    sdk: space.sdk,
    visibility: space.visibility,
    stage: space.stage,
    hardware: space.hardware,
    requestedHardware: space.requestedHardware,
    sleepTimeSeconds: space.sleepTimeSeconds,
    lastSyncedAt: toIso(space.lastSyncedAt),
    lastWakeAt: toIso(space.lastWakeAt),
    lastActionAt: toIso(space.lastActionAt),
    connectionLabel: space.hfAccount.label,
    actionSummary: { pending, failed },
    sync: {
      isUpdating: latestSyncJob ? latestSyncJob.status === ActionStatus.RUNNING : false,
      isQueued: latestSyncJob ? latestSyncJob.status === ActionStatus.PENDING : false,
      status: latestSyncJob?.status ?? null,
      requestedAt: toIso(latestSyncJob?.requestedAt),
      startedAt: toIso(latestSyncJob?.startedAt),
      availableAt: latestSyncJob?.availableAt.toISOString() ?? null,
      attemptCount: latestSyncJob?.attemptCount ?? 0,
      workerId: latestSyncJob?.workerId ?? null,
      lastError: latestSyncJob?.lastError ?? null,
      isDeadLetter: latestSyncJob ? latestSyncJob.type === "SYNC" && latestSyncJob.status === ActionStatus.FAILED && latestSyncJob.attemptCount >= SYNC_MAX_ATTEMPTS : false,
    },
    wakePolicy: policy
      ? {
          enabled: policy.enabled,
          intervalMinutes: policy.intervalMinutes,
          nextRunAt: toIso(policy.nextRunAt),
        }
      : null,
  };
}

function toTrackedSpaceDetail(space: DashboardTrackedSpace) {
  return {
    ...toDashboardSpace(space),
    jobs: space.actionJobs.filter((job) => job.type !== ActionType.SYNC).map((job) =>
      toDashboardJob(job, {
        repoId: getCanonicalRepoId({
          repoId: space.repoId,
          name: space.name,
          subdomain: space.subdomain,
          ownerUsername: space.hfAccount.username,
        }),
        displayName: getSpaceDisplayName({
          repoId: space.repoId,
          name: space.name,
          subdomain: space.subdomain,
          ownerUsername: space.hfAccount.username,
        }),
        detailPath: toSpaceDetailPath(
          getCanonicalRepoId({
            repoId: space.repoId,
            name: space.name,
            subdomain: space.subdomain,
            ownerUsername: space.hfAccount.username,
          }),
        ),
      }),
    ),
  } satisfies TrackedSpaceDetail;
}

function compareSpacesByDisplayName(left: DashboardSpace, right: DashboardSpace) {
  return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" }) ||
    left.repoId.localeCompare(right.repoId, undefined, { sensitivity: "base" });
}

function toDashboardJob(job: {
  id: string;
  trackedSpaceId: string;
  type: string;
  status: ActionStatus;
  reason: string | null;
  attemptCount: number;
  availableAt: Date;
  startedAt: Date | null;
  workerId: string | null;
  requestedAt: Date;
  finishedAt: Date | null;
  lastError: string | null;
}, input: { repoId: string; displayName: string; detailPath: string }) {
  return {
    id: job.id,
    trackedSpaceId: job.trackedSpaceId,
    repoId: input.repoId,
    displayName: input.displayName,
    detailPath: input.detailPath,
    type: job.type,
    status: job.status,
    reason: job.reason,
    attemptCount: job.attemptCount,
    availableAt: job.availableAt.toISOString(),
    startedAt: toIso(job.startedAt),
    workerId: job.workerId,
    isDeadLetter: job.type === "SYNC" && job.status === ActionStatus.FAILED && job.attemptCount >= SYNC_MAX_ATTEMPTS,
    requestedAt: job.requestedAt.toISOString(),
    finishedAt: toIso(job.finishedAt),
    lastError: job.lastError,
  } satisfies DashboardJob;
}

export async function getWorkspaceDashboard(workspaceId: string) {
  const [trackedSpaces, actionJobs] = await Promise.all([
    prisma.trackedSpace.findMany({
      where: { workspaceId },
      include: {
        hfAccount: true,
        wakePolicies: true,
        actionJobs: {
          take: 10,
          orderBy: { requestedAt: "desc" },
        },
      },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.actionJob.findMany({
      where: {
        trackedSpace: { workspaceId },
        type: { not: ActionType.SYNC },
      },
      include: {
        trackedSpace: {
          include: {
            hfAccount: true,
          },
        },
      },
      orderBy: { requestedAt: "desc" },
      take: 20,
    }),
  ]);

  const spaces: DashboardSpace[] = trackedSpaces.map(toDashboardSpace).sort(compareSpacesByDisplayName);

  const jobs: DashboardJob[] = actionJobs.map((job) =>
    toDashboardJob(job, {
      repoId: getCanonicalRepoId({
        repoId: job.trackedSpace.repoId,
        name: job.trackedSpace.name,
        subdomain: job.trackedSpace.subdomain,
        ownerUsername: job.trackedSpace.hfAccount.username,
      }),
      displayName: getSpaceDisplayName({
        repoId: job.trackedSpace.repoId,
        name: job.trackedSpace.name,
        subdomain: job.trackedSpace.subdomain,
        ownerUsername: job.trackedSpace.hfAccount.username,
      }),
      detailPath: toSpaceDetailPath(
        getCanonicalRepoId({
          repoId: job.trackedSpace.repoId,
          name: job.trackedSpace.name,
          subdomain: job.trackedSpace.subdomain,
          ownerUsername: job.trackedSpace.hfAccount.username,
        }),
      ),
    }),
  );

  return { spaces, jobs };
}

export async function getTrackedSpaceDetailByRepoId(workspaceId: string, repoId: string) {
  const trackedSpaces = await prisma.trackedSpace.findMany({
    where: { workspaceId },
    include: {
      hfAccount: true,
      wakePolicies: true,
      actionJobs: {
        take: 20,
        orderBy: { requestedAt: "desc" },
      },
    },
  });

  const trackedSpace = trackedSpaces.find((space) => {
    return (
      getCanonicalRepoId({
        repoId: space.repoId,
        name: space.name,
        subdomain: space.subdomain,
        ownerUsername: space.hfAccount.username,
      }) === repoId
    );
  });

  if (!trackedSpace) {
    return null;
  }

  return toTrackedSpaceDetail(trackedSpace);
}

export async function getTrackedSpaceDetailById(workspaceId: string, trackedSpaceId: string) {
  const trackedSpace = await prisma.trackedSpace.findUnique({
    where: { id: trackedSpaceId },
    include: {
      hfAccount: true,
      wakePolicies: true,
      actionJobs: {
        take: 20,
        orderBy: { requestedAt: "desc" },
      },
    },
  });

  if (!trackedSpace || trackedSpace.workspaceId !== workspaceId) {
    return null;
  }

  return toTrackedSpaceDetail(trackedSpace);
}

export async function getWorkspaceConnections(workspaceId: string) {
  const accounts = await prisma.huggingFaceAccount.findMany({
    where: { workspaceId },
    include: {
      trackedSpaces: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return accounts.map((account: WorkspaceConnection) => ({
    id: account.id,
    label: account.label,
    username: account.username,
    tokenRole: account.tokenRole,
    lastValidatedAt: toIso(account.lastValidatedAt),
    maskedToken: maskToken(
      decryptSecret({
        ciphertext: account.tokenCiphertext,
        iv: account.tokenIv,
        authTag: account.tokenAuthTag,
        fingerprint: account.tokenFingerprint,
      }),
    ),
    trackedSpacesCount: account.trackedSpaces.length,
  }));
}

export async function getWorkspaceMembers(workspaceId: string) {
  const members = await prisma.membership.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return members.map((membership) => ({
    id: membership.id,
    role: membership.role,
    name: membership.user.name,
    email: membership.user.email,
    createdAt: membership.createdAt.toISOString(),
  }));
}

export async function getWorkspaceSummary(workspaceId: string) {
  const [membersCount, connectionsCount, spacesCount, jobsCount] = await Promise.all([
    prisma.membership.count({ where: { workspaceId } }),
    prisma.huggingFaceAccount.count({ where: { workspaceId } }),
    prisma.trackedSpace.count({ where: { workspaceId } }),
    prisma.actionJob.count({
      where: {
        trackedSpace: { workspaceId },
        type: { not: ActionType.SYNC },
        status: { in: [ActionStatus.PENDING, ActionStatus.RUNNING] },
      },
    }),
  ]);

  return {
    membersCount,
    connectionsCount,
    spacesCount,
    jobsCount,
  };
}

export async function addWorkspaceMember(input: {
  workspaceId: string;
  email: string;
  name: string;
  passwordHash?: string;
  role: MembershipRole;
}) {
  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email: input.email },
    });

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash ?? "",
        },
      }));

    return tx.membership.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: input.workspaceId,
        },
      },
      update: {
        role: input.role,
      },
      create: {
        userId: user.id,
        workspaceId: input.workspaceId,
        role: input.role,
      },
    });
  });
}

export const jsonCast = <T extends Prisma.InputJsonValue>(value: T) => value;