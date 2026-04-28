import { NextResponse } from "next/server";

import { getWorkspaceDashboard } from "@/lib/app-data";
import { requireApiSession } from "@/lib/auth/session";
import { processAvailableJobs } from "@/lib/jobs/processor";
import { enqueueWorkspaceSyncJobs } from "@/lib/jobs/queue";

export async function POST() {
  const session = await requireApiSession();

  try {
    const result = await enqueueWorkspaceSyncJobs({
      workspaceId: session.user.workspaceId,
      createdById: session.user.id,
      reason: "dashboard refresh",
    });

    if (result.queuedTrackedSpaceIds.length > 0) {
      void processAvailableJobs();
    }
  } catch (error) {
    const dashboard = await getWorkspaceDashboard(session.user.workspaceId);

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sync failed.", ...dashboard });
  }

  const dashboard = await getWorkspaceDashboard(session.user.workspaceId);
  return NextResponse.json({ ok: true, ...dashboard });
}