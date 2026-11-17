import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { provisionOrganizationDefaults } from "@/lib/accounting/provision";

export const DEMO_EMAIL = "demo@bilagsmatch.dk";
export const DEMO_PASSWORD = "demo1234";

/** Create the demo organization, user and data. Refuses to run twice. */
export async function seedDemo(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    return "Demo data findes allerede – kør `npm run db:reset` for at starte forfra.";
  }
  const org = await prisma.organization.create({ data: { name: "Zignifikant Demo" } });
  await prisma.user.create({
    data: {
      organizationId: org.id,
      email: DEMO_EMAIL,
      name: "Demo Bogholder",
      role: "OWNER",
      passwordHash: await hashPassword(DEMO_PASSWORD),
    },
  });
  await provisionOrganizationDefaults(prisma, org.id);
  return `Seeded organization "${org.name}" with user ${DEMO_EMAIL}.`;
}
