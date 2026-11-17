import { z } from "zod";
import type { SessionContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/api/errors";
import { IdSchema } from "@/lib/validation/schemas";
import { isValidCvr, normalizeCvr } from "@/lib/cvr";
import { supplierNamePattern } from "@/lib/categorization/suggest";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/client";

// ---------- Rules ----------

const RuleBase = z.object({
  matchType: z.enum(["SUPPLIER_CVR", "SUPPLIER_NAME", "BANK_TEXT_CONTAINS"]),
  pattern: z.string().trim().min(2, "Mønsteret skal være mindst 2 tegn").max(100),
  accountNumber: z.string().trim().min(1).max(10),
  vatCode: z.string().trim().min(1).max(10),
});

function normalizePattern(
  matchType: z.infer<typeof RuleBase>["matchType"],
  pattern: string,
): string {
  if (matchType === "SUPPLIER_CVR") {
    if (!isValidCvr(pattern)) throw badRequest("CVR-nummer skal være 8 cifre.");
    return normalizeCvr(pattern);
  }
  if (matchType === "SUPPLIER_NAME") {
    const p = supplierNamePattern(pattern);
    if (p.length < 2) throw badRequest("Leverandørnavnet er for kort efter normalisering.");
    return p;
  }
  return pattern.toLowerCase();
}

async function assertAccountVat(ctx: SessionContext, accountNumber: string, vatCode: string) {
  const [a, v] = await Promise.all([
    ctx.db.account.findFirst({ where: { number: accountNumber } }),
    ctx.db.vatCode.findFirst({ where: { code: vatCode } }),
  ]);
  if (!a) throw badRequest(`Kontoen ${accountNumber} findes ikke.`);
  if (!v) throw badRequest(`Momskoden ${vatCode} findes ikke.`);
}

export async function listRules(ctx: SessionContext) {
  return ctx.db.categorizationRule.findMany({
    orderBy: [{ timesApplied: "desc" }, { pattern: "asc" }],
  });
}

export async function createRule(ctx: SessionContext, raw: unknown) {
  const input = RuleBase.parse(raw);
  await assertAccountVat(ctx, input.accountNumber, input.vatCode);
  const pattern = normalizePattern(input.matchType, input.pattern);
  const exists = await ctx.db.categorizationRule.findFirst({
    where: { matchType: input.matchType, pattern },
  });
  if (exists) throw conflict("Der findes allerede en regel med samme type og mønster.");
  const rule = await ctx.db.categorizationRule.create({
    data: { organizationId: ctx.organizationId, ...input, pattern, createdFrom: "MANUAL" },
  });
  await audit(ctx.db, ctx, "rule.create", "CategorizationRule", rule.id);
  return rule;
}

export async function updateRule(ctx: SessionContext, id: string, raw: unknown) {
  if (!IdSchema.safeParse(id).success) throw notFound("Reglen");
  const rule = await ctx.db.categorizationRule.findUnique({ where: { id } });
  if (!rule) throw notFound("Reglen");
  const input = RuleBase.partial().parse(raw);
  const accountNumber = input.accountNumber ?? rule.accountNumber;
  const vatCode = input.vatCode ?? rule.vatCode;
  await assertAccountVat(ctx, accountNumber, vatCode);
  const matchType = input.matchType ?? rule.matchType;
  const pattern =
    input.pattern !== undefined ? normalizePattern(matchType, input.pattern) : rule.pattern;
  const updated = await ctx.db.categorizationRule.update({
    where: { id },
    data: { matchType, pattern, accountNumber, vatCode },
  });
  await audit(ctx.db, ctx, "rule.update", "CategorizationRule", id);
  return updated;
}

export async function deleteRule(ctx: SessionContext, id: string) {
  if (!IdSchema.safeParse(id).success) throw notFound("Reglen");
  const res = await ctx.db.categorizationRule.deleteMany({ where: { id } });
  if (res.count === 0) throw notFound("Reglen");
  await audit(ctx.db, ctx, "rule.delete", "CategorizationRule", id);
}

// ---------- Chart of accounts ----------

const AccountSchema = z.object({
  number: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Kontonummer skal være 1-10 cifre"),
  name: z.string().trim().min(1, "Navn skal udfyldes").max(100),
  type: z.enum(["REVENUE", "EXPENSE", "ASSET", "LIABILITY", "EQUITY"]),
  defaultVatCode: z.string().trim().max(10).nullable(),
});

export async function listAccounts(ctx: SessionContext) {
  const [accounts, vatCodes] = await Promise.all([
    ctx.db.account.findMany({ orderBy: { number: "asc" } }),
    ctx.db.vatCode.findMany({ orderBy: { code: "asc" } }),
  ]);
  return { accounts, vatCodes };
}

async function assertVat(ctx: SessionContext, code: string | null | undefined) {
  if (!code) return;
  if (!(await ctx.db.vatCode.findFirst({ where: { code } })))
    throw badRequest(`Momskoden ${code} findes ikke.`);
}

export async function createAccount(ctx: SessionContext, raw: unknown) {
  const input = AccountSchema.parse(raw);
  await assertVat(ctx, input.defaultVatCode);
  if (await ctx.db.account.findFirst({ where: { number: input.number } })) {
    throw conflict(`Konto ${input.number} findes allerede.`);
  }
  const acc = await ctx.db.account.create({
    data: { organizationId: ctx.organizationId, ...input },
  });
  await audit(ctx.db, ctx, "account.update", "Account", acc.id, { created: true });
  return acc;
}

export async function updateAccount(ctx: SessionContext, id: string, raw: unknown) {
  if (!IdSchema.safeParse(id).success) throw notFound("Kontoen");
  const acc = await ctx.db.account.findUnique({ where: { id } });
  if (!acc) throw notFound("Kontoen");
  const input = AccountSchema.omit({ number: true }).partial().parse(raw);
  await assertVat(ctx, input.defaultVatCode);
  const updated = await ctx.db.account.update({ where: { id }, data: input });
  await audit(ctx.db, ctx, "account.update", "Account", id);
  return updated;
}

const VatUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
});

export async function updateVatCode(ctx: SessionContext, id: string, raw: unknown) {
  if (!IdSchema.safeParse(id).success) throw notFound("Momskoden");
  const v = await ctx.db.vatCode.findUnique({ where: { id } });
  if (!v) throw notFound("Momskoden");
  const input = VatUpdateSchema.partial().parse(raw);
  return ctx.db.vatCode.update({ where: { id }, data: input });
}

// ---------- Organization & users ----------

export async function getOrganizationOverview(ctx: SessionContext) {
  const [org, users] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
    ctx.db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
  ]);
  return { org, users };
}

export async function renameOrganization(ctx: SessionContext, raw: unknown) {
  if (ctx.role !== "OWNER") throw forbidden("Kun ejere kan ændre organisationen.");
  const { name } = z.object({ name: z.string().trim().min(1).max(200) }).parse(raw);
  return prisma.organization.update({ where: { id: ctx.organizationId }, data: { name } });
}

const NewUserSchema = z.object({
  name: z.string().trim().min(1, "Navn skal udfyldes").max(100),
  email: z.string().trim().toLowerCase().email("Ugyldig e-mail"),
  password: z.string().min(8, "Adgangskoden skal være mindst 8 tegn").max(200),
  role: z.enum(["OWNER", "MEMBER"]).default("MEMBER"),
});

export async function createUser(ctx: SessionContext, raw: unknown) {
  if (ctx.role !== "OWNER") throw forbidden("Kun ejere kan oprette brugere.");
  const input = NewUserSchema.parse(raw);
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw conflict("Der findes allerede en bruger med den e-mail.");
  }
  const user = await ctx.db.user.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true, name: true, email: true, role: true },
  });
  await audit(ctx.db, ctx, "user.create", "User", user.id);
  return user;
}
