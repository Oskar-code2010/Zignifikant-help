import { Prisma } from "@prisma/client";
import { prisma } from "./client";

/** Models that carry an organizationId column. Everything except Organization itself. */
const TENANT_MODELS = new Set<string>([
  "User",
  "Client",
  "Document",
  "BankAccount",
  "BankImport",
  "BankTransaction",
  "Match",
  "Account",
  "VatCode",
  "JournalEntry",
  "CategorizationRule",
  "AuditLog",
  "Job",
]);

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function scopeWhere(where: unknown, organizationId: string): Obj {
  const w = isObj(where) ? { ...where } : {};
  if (w.organizationId !== undefined && w.organizationId !== organizationId) {
    throw new TenantViolationError("Query targets another organization");
  }
  w.organizationId = organizationId;
  return w;
}

function scopeData(data: unknown, organizationId: string): Obj {
  if (!isObj(data)) throw new TenantViolationError("Missing data");
  if (data.organizationId !== undefined && data.organizationId !== organizationId) {
    throw new TenantViolationError("Create targets another organization");
  }
  if (isObj(data.organization)) {
    throw new TenantViolationError("Use organizationId, not a nested organization relation");
  }
  return { ...data, organizationId };
}

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

/**
 * Return a Prisma client where every query on a tenant model is restricted to one organization:
 * reads/updates/deletes get `organizationId` added to `where`, creates get it forced on `data`.
 * A query that explicitly names a different organization throws TenantViolationError.
 */
export function forOrg(organizationId: string) {
  if (!organizationId) throw new TenantViolationError("organizationId is required");
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a: Obj = isObj(args) ? { ...args } : {};
          if (WHERE_OPS.has(operation)) {
            a.where = scopeWhere(a.where, organizationId);
          }
          if (operation === "create") {
            a.data = scopeData(a.data, organizationId);
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((r) => scopeData(r, organizationId));
          } else if (operation === "upsert") {
            a.create = scopeData(a.create, organizationId);
          } else if (operation === "update" || operation === "updateMany") {
            if (isObj(a.data) && a.data.organizationId !== undefined) {
              throw new TenantViolationError("organizationId cannot be changed");
            }
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof forOrg>;
export type ScopedTx = Omit<ScopedDb, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export { Prisma };
