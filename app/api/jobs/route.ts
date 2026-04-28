import { ActionType, MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireTrackedSpaceAccess } from "@/lib/actions/service";
import { requireApiSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function DELETE() {
  try {
    const session = await requireApiSession();

    await requireTrackedSpaceAccess(session.user.id, session.user.workspaceId, MembershipRole.OPERATOR);

    await prisma.actionJob.deleteMany({
      where: {
        type: { not: ActionType.SYNC },
        trackedSpace: {
          workspaceId: session.user.workspaceId,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear jobs." },
      { status: 400 },
    );
  }
}