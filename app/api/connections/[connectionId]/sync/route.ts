import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { syncConnection } from "@/lib/monitoring/service";
import { hasRequiredRole } from "@/lib/rbac";

export async function POST(_: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const session = await requireApiSession();
    if (!hasRequiredRole(session.user.role as MembershipRole, MembershipRole.ADMIN)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { connectionId } = await context.params;
    const connection = await prisma.huggingFaceAccount.findUnique({ where: { id: connectionId } });

    if (!connection || connection.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await syncConnection(connectionId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed." },
      { status: 400 },
    );
  }
}