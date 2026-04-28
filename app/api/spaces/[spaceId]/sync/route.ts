import { NextResponse } from "next/server";

import { getTrackedSpaceDetailById } from "@/lib/app-data";
import { requireApiSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { processAvailableJobs } from "@/lib/jobs/processor";
import { enqueueTrackedSpaceSyncJob } from "@/lib/jobs/queue";

export async function GET(_: Request, context: { params: Promise<{ spaceId: string }> }) {
  const session = await requireApiSession();
  const { spaceId } = await context.params;

  const trackedSpace = await prisma.trackedSpace.findUnique({ where: { id: spaceId } });

  if (!trackedSpace || trackedSpace.workspaceId !== session.user.workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const space = await getTrackedSpaceDetailById(session.user.workspaceId, trackedSpace.id);
  return NextResponse.json({ ok: true, space });
}

export async function POST(_: Request, context: { params: Promise<{ spaceId: string }> }) {
  const session = await requireApiSession();
  const { spaceId } = await context.params;

  const trackedSpace = await prisma.trackedSpace.findUnique({ where: { id: spaceId } });

  if (!trackedSpace || trackedSpace.workspaceId !== session.user.workspaceId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await enqueueTrackedSpaceSyncJob({
      trackedSpaceId: trackedSpace.id,
      createdById: session.user.id,
      reason: "detail refresh",
    });

    if (result.created) {
      void processAvailableJobs();
    }
  } catch (error) {
    const space = await getTrackedSpaceDetailById(session.user.workspaceId, trackedSpace.id);

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed.", space },
      { status: 200 },
    );
  }

  const space = await getTrackedSpaceDetailById(session.user.workspaceId, trackedSpace.id);
  return NextResponse.json({ ok: true, space });
}