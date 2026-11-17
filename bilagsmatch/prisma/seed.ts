import { prisma } from "../src/lib/db/client";
import { seedDemo } from "../src/lib/seed/demo";

seedDemo(prisma)
  .then((summary) => {
    console.info(summary);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
