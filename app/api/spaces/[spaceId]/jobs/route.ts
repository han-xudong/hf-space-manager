import { ActionType, MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireTrackedSpaceAccess } from "@/lib/actions/service";
import { requireApiSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function DELETE(_: Request, context: { params: Promise<{ spaceId: string }> }) {
  try {
    const session = await requireApiSession();
    const { spaceId } = await context.params;
    const trackedSpace = await prisma.trackedSpace.findUnique({ where: { id: spaceId } });

    if (!trackedSpace || trackedSpace.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await requireTrackedSpaceAccess(session.user.id, trackedSpace.workspaceId, MembershipRole.OPERATOR);

    await prisma.actionJob.deleteMany({
      where: {
        trackedSpaceId: trackedSpace.id,
        type: { not: ActionType.SYNC },
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