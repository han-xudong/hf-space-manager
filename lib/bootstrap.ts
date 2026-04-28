import { MembershipRole } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

let bootstrapPromise: Promise<void> | null = null;

async function runBootstrap() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return;
  }

  await prisma.workspace.create({
    data: {
      name: "Primary Workspace",
      memberships: {
        create: {
          role: MembershipRole.OWNER,
          user: {
            create: {
              email: env.BOOTSTRAP_ADMIN_EMAIL,
              name: env.BOOTSTRAP_ADMIN_NAME,
              passwordHash: "single-user-local-mode",
            },
          },
        },
      },
    },
  });
}

export async function ensureBootstrapState() {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().finally(() => {
      bootstrapPromise = null;
    });
  }

  await bootstrapPromise;
}