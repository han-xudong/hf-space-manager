import prismaPackage from "@prisma/client";

const { MembershipRole, PrismaClient } = prismaPackage;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

async function main() {
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
              email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com",
              name: process.env.BOOTSTRAP_ADMIN_NAME ?? "Admin",
              passwordHash: "single-user-local-mode",
            },
          },
        },
      },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });