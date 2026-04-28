import { ensureBootstrapState } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string;
    workspaceId: string;
    role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  };
};

export async function auth(): Promise<AppSession> {
  await ensureBootstrapState();

  const user = await prisma.user.findFirst({
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const membership = user?.memberships[0];

  if (!user || !membership) {
    throw new Error("Single-user bootstrap session is unavailable.");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      workspaceId: membership.workspaceId,
      role: membership.role,
    },
  };
}