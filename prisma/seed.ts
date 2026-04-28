import { ensureBootstrapState } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";

async function main() {
  await ensureBootstrapState();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });