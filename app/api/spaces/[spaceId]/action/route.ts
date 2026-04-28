import { ActionType, MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { enqueueSpaceAction, processPendingActionJob, requireTrackedSpaceAccess } from "@/lib/actions/service";
import { requireApiSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { claimActionJob, createWorkerId } from "@/lib/jobs/queue";

const actionSchema = z.object({
  type: z.enum(["RESTART", "REBUILD"]),
});

export async function POST(request: Request, context: { params: Promise<{ spaceId: string }> }) {
  try {
    const session = await requireApiSession();
    const { spaceId } = await context.params;
    const trackedSpace = await prisma.trackedSpace.findUnique({ where: { id: spaceId } });

    if (!trackedSpace || trackedSpace.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await requireTrackedSpaceAccess(session.user.id, trackedSpace.workspaceId, MembershipRole.OPERATOR);
    const parsed = actionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const job = await enqueueSpaceAction({
      trackedSpaceId: trackedSpace.id,
      createdById: session.user.id,
      type: parsed.data.type as ActionType,
    });

    const claimed = await claimActionJob(job.id, {
      workerId: createWorkerId("api"),
      leaseMs: 30_000,
    });

    if (claimed) {
      await processPendingActionJob(job.id);
    }

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 400 },
    );
  }
}