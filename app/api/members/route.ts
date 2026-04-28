import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { addWorkspaceMember, getWorkspaceMembers } from "@/lib/app-data";
import { requireApiSession } from "@/lib/auth/session";
import { hasRequiredRole } from "@/lib/rbac";
import { hashPassword } from "@/lib/security/password";

const createMemberSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().optional(),
  role: z.nativeEnum(MembershipRole),
});

export async function GET() {
  try {
    const session = await requireApiSession();
    const members = await getWorkspaceMembers(session.user.workspaceId);
    return NextResponse.json({ members });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    if (!hasRequiredRole(session.user.role as MembershipRole, MembershipRole.ADMIN)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = createMemberSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : undefined;
    const membership = await addWorkspaceMember({
      workspaceId: session.user.workspaceId,
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
    });

    await writeAuditLog({
      workspaceId: session.user.workspaceId,
      actorUserId: session.user.id,
      event: "member.upserted",
      targetType: "membership",
      targetId: membership.id,
      metadata: { email: parsed.data.email, role: parsed.data.role },
    });

    return NextResponse.json({ ok: true, id: membership.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add member." },
      { status: 400 },
    );
  }
}