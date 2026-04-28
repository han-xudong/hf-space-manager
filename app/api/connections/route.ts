import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { getWorkspaceConnections } from "@/lib/app-data";
import { requireApiSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateHfToken } from "@/lib/hf/client";
import { syncConnection } from "@/lib/monitoring/service";
import { hasRequiredRole } from "@/lib/rbac";
import { encryptSecret } from "@/lib/security/crypto";

const createConnectionSchema = z.object({
  label: z.string().min(2).max(64),
  token: z.string().min(10),
});

export async function GET() {
  try {
    const session = await requireApiSession();
    const connections = await getWorkspaceConnections(session.user.workspaceId);
    return NextResponse.json({ connections });
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

    const parsed = createConnectionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const tokenInfo = await validateHfToken(parsed.data.token);
    const encrypted = encryptSecret(parsed.data.token);

    const connection = await prisma.huggingFaceAccount.create({
      data: {
        workspaceId: session.user.workspaceId,
        label: parsed.data.label,
        username: tokenInfo.username,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenFingerprint: encrypted.fingerprint,
        tokenRole: tokenInfo.tokenRole,
        lastValidatedAt: new Date(),
      },
    });

    await syncConnection(connection.id);

    await writeAuditLog({
      workspaceId: session.user.workspaceId,
      actorUserId: session.user.id,
      event: "connection.created",
      targetType: "hf_account",
      targetId: connection.id,
      metadata: { label: connection.label, username: connection.username },
    });

    return NextResponse.json({ ok: true, id: connection.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create connection." },
      { status: 400 },
    );
  }
}