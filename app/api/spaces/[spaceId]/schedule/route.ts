import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTrackedSpaceAccess, updateWakePolicy } from "@/lib/actions/service";
import { requireApiSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const scheduleSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(5).max(1440),
});

export async function POST(request: Request, context: { params: Promise<{ spaceId: string }> }) {
  try {
    const session = await requireApiSession();
    const { spaceId } = await context.params;
    const trackedSpace = await prisma.trackedSpace.findUnique({
      where: { id: spaceId },
      include: { wakePolicies: true },
    });

    if (!trackedSpace || trackedSpace.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await requireTrackedSpaceAccess(session.user.id, trackedSpace.workspaceId, MembershipRole.ADMIN);
    const body = await request.json();
    const parsed = scheduleSchema.safeParse({
      enabled: Boolean(body.enabled),
      intervalMinutes: Number(body.intervalMinutes),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const existingPolicy = trackedSpace.wakePolicies;

    if (!parsed.data.enabled && existingPolicy) {
      await prisma.wakePolicy.update({
        where: { id: existingPolicy.id },
        data: { enabled: false },
      });
      return NextResponse.json({ ok: true, enabled: false });
    }

    const policy = await updateWakePolicy({
      trackedSpaceId: trackedSpace.id,
      workspaceId: trackedSpace.workspaceId,
      intervalMinutes: parsed.data.intervalMinutes,
    });

    return NextResponse.json({ ok: true, policyId: policy.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update schedule." },
      { status: 400 },
    );
  }
}