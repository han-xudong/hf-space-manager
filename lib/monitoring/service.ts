import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSpaceDetails, listOwnedSpaces, validateHfToken } from "@/lib/hf/client";
import { decryptSecret } from "@/lib/security/crypto";
import { getCanonicalRepoId } from "@/lib/spaces/identity";

function decryptConnectionToken(account: {
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
}) {
  return decryptSecret({
    ciphertext: account.tokenCiphertext,
    iv: account.tokenIv,
    authTag: account.tokenAuthTag,
    fingerprint: "",
  });
}

export async function syncConnection(connectionId: string) {
  const account = await prisma.huggingFaceAccount.findUnique({
    where: { id: connectionId },
  });

  if (!account) {
    throw new Error("Connection not found.");
  }

  const token = decryptConnectionToken(account);
  const tokenInfo = await validateHfToken(token);
  const spaces = await listOwnedSpaces(token, account.username);

  await prisma.huggingFaceAccount.update({
    where: { id: account.id },
    data: {
      username: tokenInfo.username,
      tokenRole: tokenInfo.tokenRole,
      lastValidatedAt: new Date(),
    },
  });

  for (const space of spaces) {
    const legacyRepoId = typeof space.rawPayload.id === "string" ? space.rawPayload.id : null;
    const existingTrackedSpace = await prisma.trackedSpace.findFirst({
      where: {
        workspaceId: account.workspaceId,
        OR: [
          { repoId: space.repoId },
          ...(space.subdomain ? [{ subdomain: space.subdomain }] : []),
          ...(legacyRepoId ? [{ repoId: legacyRepoId }] : []),
        ],
      },
    });

    const tracked = existingTrackedSpace
      ? await prisma.trackedSpace.update({
          where: { id: existingTrackedSpace.id },
          data: {
            hfAccountId: account.id,
            repoId: space.repoId,
            name: space.name,
            subdomain: space.subdomain,
            sdk: space.sdk,
            visibility: space.visibility,
            stage: space.stage,
            hardware: space.hardware,
            requestedHardware: space.requestedHardware,
            sleepTimeSeconds: space.sleepTimeSeconds,
            lastModifiedAt: space.lastModifiedAt,
            lastSyncedAt: new Date(),
            enabled: true,
          },
        })
      : await prisma.trackedSpace.create({
          data: {
            workspaceId: account.workspaceId,
            hfAccountId: account.id,
            repoId: space.repoId,
            name: space.name,
            subdomain: space.subdomain,
            sdk: space.sdk,
            visibility: space.visibility,
            stage: space.stage,
            hardware: space.hardware,
            requestedHardware: space.requestedHardware,
            sleepTimeSeconds: space.sleepTimeSeconds,
            lastModifiedAt: space.lastModifiedAt,
            lastSyncedAt: new Date(),
          },
        });

    await prisma.spaceSnapshot.create({
      data: {
        trackedSpaceId: tracked.id,
        stage: space.stage,
        hardware: space.hardware,
        requestedHardware: space.requestedHardware,
        sleepTimeSeconds: space.sleepTimeSeconds,
        rawPayload: space.rawPayload as Prisma.InputJsonValue,
      },
    });
  }

  await writeAuditLog({
    workspaceId: account.workspaceId,
    event: "connection.synced",
    targetType: "hf_account",
    targetId: account.id,
    metadata: { spacesDiscovered: spaces.length },
  });

  return { spacesDiscovered: spaces.length };
}

export async function syncTrackedSpace(trackedSpaceId: string) {
  const trackedSpace = await prisma.trackedSpace.findUnique({
    where: { id: trackedSpaceId },
    include: { hfAccount: true },
  });

  if (!trackedSpace) {
    throw new Error("Tracked space not found.");
  }

  const token = decryptConnectionToken(trackedSpace.hfAccount);
  const details = await getSpaceDetails(
    token,
    getCanonicalRepoId({
      repoId: trackedSpace.repoId,
      name: trackedSpace.name,
      subdomain: trackedSpace.subdomain,
      ownerUsername: trackedSpace.hfAccount.username,
    }),
  );

  const updated = await prisma.trackedSpace.update({
    where: { id: trackedSpaceId },
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
    },
  });

  await prisma.spaceSnapshot.create({
    data: {
      trackedSpaceId: trackedSpace.id,
      stage: details.stage,
      hardware: details.hardware,
      requestedHardware: details.requestedHardware,
      sleepTimeSeconds: details.sleepTimeSeconds,
      rawPayload: details.rawPayload as Prisma.InputJsonValue,
    },
  });

  return updated;
}

export async function syncWorkspaceSpaces(workspaceId: string) {
  const trackedSpaces = await prisma.trackedSpace.findMany({
    where: { workspaceId, enabled: true },
    select: { id: true },
  });

  await Promise.all(trackedSpaces.map((space) => syncTrackedSpace(space.id)));
}