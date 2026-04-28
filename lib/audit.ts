import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

type AuditLogInput = {
  workspaceId: string;
  actorUserId?: string | null;
  event: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditLogInput) {
  return prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      event: input.event,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}