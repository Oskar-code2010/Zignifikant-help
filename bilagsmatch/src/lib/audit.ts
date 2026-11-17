import type { Prisma } from "@prisma/client";
import type { ScopedTx } from "@/lib/db/scoped";

export type AuditAction =
  | "client.create"
  | "client.update"
  | "client.delete"
  | "document.upload"
  | "document.update"
  | "document.delete"
  | "document.retry"
  | "bank.import"
  | "matching.run"
  | "match.confirm"
  | "match.reject"
  | "match.manual"
  | "match.bulk_confirm"
  | "transaction.ignore"
  | "transaction.missing_receipt"
  | "transaction.reset"
  | "export.create"
  | "rule.create"
  | "rule.update"
  | "rule.delete"
  | "account.update"
  | "user.create";

/** Write an audit log entry. Never put document contents or amounts tied to names in details. */
export async function audit(
  db: Pick<ScopedTx, "auditLog">,
  ctx: { organizationId: string; userId: string | null },
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  details?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action,
      entityType,
      entityId,
      details,
    },
  });
}
