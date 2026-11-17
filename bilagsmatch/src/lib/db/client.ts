import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

/**
 * Unscoped Prisma client. Only use it for auth lookups, the job worker and seeding.
 * Application code must use `forOrg(organizationId)` from ./scoped.
 */
export const prisma: PrismaClient = globalForPrisma.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;
