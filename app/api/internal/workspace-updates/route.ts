import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { publishWorkspaceUpdate } from "@/lib/realtime/events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = request.headers.get("x-internal-event-token");

  if (token !== env.INTERNAL_EVENT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { workspaceId?: string } | null;
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : null;

  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  publishWorkspaceUpdate(workspaceId);
  return NextResponse.json({ ok: true });
}