import { beforeAll, describe, expect, it } from "vitest";
import * as rulesRoute from "@/app/api/rules/route";
import * as ruleRoute from "@/app/api/rules/[ruleId]/route";
import * as accountsRoute from "@/app/api/accounts/route";
import * as accountRoute from "@/app/api/accounts/[accountId]/route";
import * as vatRoute from "@/app/api/vat-codes/[vatCodeId]/route";
import * as orgRoute from "@/app/api/organization/route";
import * as usersRoute from "@/app/api/users/route";
import { actAs, call, createOrgWithUser } from "./helpers";
import { prisma } from "@/lib/db/client";
import { authenticate, LoginRateLimitedError } from "@/lib/auth/credentials";
import { hashPassword } from "@/lib/auth/password";
import { loginLimiterByEmail, loginLimiterByIp, RateLimiter } from "@/lib/rate-limit";

let a: Awaited<ReturnType<typeof createOrgWithUser>>;
let b: Awaited<ReturnType<typeof createOrgWithUser>>;

beforeAll(async () => {
  a = await createOrgWithUser("SetA");
  b = await createOrgWithUser("SetB");
});

describe("rules API", () => {
  it("creates normalized rules, validates and enforces org scope", async () => {
    actAs(a.user.id);
    const res = await call(rulesRoute.POST, {
      method: "POST",
      body: {
        matchType: "SUPPLIER_NAME",
        pattern: "Shopify International Limited",
        accountNumber: "3610",
        vatCode: "IEUY",
      },
    });
    expect(res.status).toBe(201);
    const rule = (res.json as { rule: { id: string; pattern: string; createdFrom: string } }).rule;
    expect(rule).toMatchObject({ pattern: "shopify", createdFrom: "MANUAL" });
    expect(
      (
        await call(rulesRoute.POST, {
          method: "POST",
          body: {
            matchType: "SUPPLIER_NAME",
            pattern: "Shopify ApS",
            accountNumber: "3610",
            vatCode: "IEUY",
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(rulesRoute.POST, {
          method: "POST",
          body: {
            matchType: "SUPPLIER_CVR",
            pattern: "12",
            accountNumber: "3610",
            vatCode: "IEUY",
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(rulesRoute.POST, {
          method: "POST",
          body: {
            matchType: "SUPPLIER_NAME",
            pattern: "x y",
            accountNumber: "0000",
            vatCode: "IEUY",
          },
        })
      ).status,
    ).toBe(400);

    const upd = await call(ruleRoute.PATCH, {
      method: "PATCH",
      params: { ruleId: rule.id },
      body: { accountNumber: "2820" },
    });
    expect(upd.json).toMatchObject({ rule: { accountNumber: "2820", vatCode: "IEUY" } });

    actAs(b.user.id);
    expect(((await call(rulesRoute.GET)).json as { rules: unknown[] }).rules).toEqual([]);
    expect(
      (
        await call(ruleRoute.PATCH, {
          method: "PATCH",
          params: { ruleId: rule.id },
          body: { accountNumber: "1350" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(ruleRoute.DELETE, { method: "DELETE", params: { ruleId: rule.id } })).status,
    ).toBe(404);

    actAs(a.user.id);
    expect(
      (await call(ruleRoute.DELETE, { method: "DELETE", params: { ruleId: rule.id } })).status,
    ).toBe(200);
    expect(
      (await call(ruleRoute.DELETE, { method: "DELETE", params: { ruleId: rule.id } })).status,
    ).toBe(404);
  });
});

describe("chart of accounts API", () => {
  it("lists, creates and edits accounts in the own org only", async () => {
    actAs(a.user.id);
    const list = (await call(accountsRoute.GET)).json as {
      accounts: { id: string; number: string }[];
      vatCodes: { id: string; code: string }[];
    };
    expect(list.accounts.some((x) => x.number === "3610")).toBe(true);
    expect(list.vatCodes.map((v) => v.code).sort()).toEqual([
      "I25",
      "IEU",
      "IEUY",
      "IVY",
      "NONE",
      "U25",
    ]);
    const created = await call(accountsRoute.POST, {
      method: "POST",
      body: { number: "2900", name: "Repræsentation", type: "EXPENSE", defaultVatCode: "I25" },
    });
    expect(created.status).toBe(201);
    expect(
      (
        await call(accountsRoute.POST, {
          method: "POST",
          body: { number: "2900", name: "Dublet", type: "EXPENSE", defaultVatCode: null },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(accountsRoute.POST, {
          method: "POST",
          body: { number: "29a", name: "x", type: "EXPENSE", defaultVatCode: null },
        })
      ).status,
    ).toBe(400);

    const acc = list.accounts.find((x) => x.number === "3610")!;
    const vat = list.vatCodes.find((v) => v.code === "IEUY")!;
    expect(
      (
        await call(accountRoute.PATCH, {
          method: "PATCH",
          params: { accountId: acc.id },
          body: { name: "Shopify og apps" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(accountRoute.PATCH, {
          method: "PATCH",
          params: { accountId: acc.id },
          body: { defaultVatCode: "XX" },
        })
      ).status,
    ).toBe(400);

    actAs(b.user.id);
    expect(
      (
        await call(accountRoute.PATCH, {
          method: "PATCH",
          params: { accountId: acc.id },
          body: { name: "hacked" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(vatRoute.PATCH, {
          method: "PATCH",
          params: { vatCodeId: vat.id },
          body: { name: "hacked" },
        })
      ).status,
    ).toBe(404);
    const bList = (await call(accountsRoute.GET)).json as { accounts: { number: string }[] };
    expect(bList.accounts.some((x) => x.number === "2900")).toBe(false);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: acc.id } })).name).toBe(
      "Shopify og apps",
    );
  });
});

describe("organization and users", () => {
  it("only owners can rename the organization and create users", async () => {
    const member = await prisma.user.create({
      data: {
        organizationId: a.org.id,
        email: `member-${Date.now()}@test.dk`,
        name: "Medlem",
        role: "MEMBER",
        passwordHash: "x",
      },
    });
    actAs(member.id);
    expect(
      (await call(orgRoute.PATCH, { method: "PATCH", body: { name: "Nyt navn" } })).status,
    ).toBe(403);
    expect(
      (
        await call(usersRoute.POST, {
          method: "POST",
          body: { name: "X", email: "x@test.dk", password: "12345678" },
        })
      ).status,
    ).toBe(403);

    actAs(a.user.id);
    expect(
      (await call(orgRoute.PATCH, { method: "PATCH", body: { name: "Org A omdøbt" } })).status,
    ).toBe(200);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: b.org.id } })).name).toBe(
      "Org SetB",
    );
    const email = `new-${Date.now()}@test.dk`;
    const created = await call(usersRoute.POST, {
      method: "POST",
      body: { name: "Ny", email, password: "hemmelig123", role: "MEMBER" },
    });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.json)).not.toContain("passwordHash");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.organizationId).toBe(a.org.id);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(
      (
        await call(usersRoute.POST, {
          method: "POST",
          body: { name: "Ny", email, password: "hemmelig123" },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(usersRoute.POST, {
          method: "POST",
          body: { name: "Kort", email: "k@test.dk", password: "123" },
        })
      ).status,
    ).toBe(400);
  });

  it("anonymous requests are rejected on every settings route", async () => {
    actAs(null);
    expect((await call(rulesRoute.GET)).status).toBe(401);
    expect((await call(rulesRoute.POST, { method: "POST", body: {} })).status).toBe(401);
    expect((await call(accountsRoute.GET)).status).toBe(401);
    expect((await call(orgRoute.PATCH, { method: "PATCH", body: {} })).status).toBe(401);
    expect((await call(usersRoute.POST, { method: "POST", body: {} })).status).toBe(401);
  });
});

describe("login", () => {
  it("authenticates with bcrypt and rejects wrong passwords", async () => {
    const email = `login-${Date.now()}@test.dk`;
    await prisma.user.create({
      data: {
        organizationId: a.org.id,
        email,
        name: "L",
        role: "MEMBER",
        passwordHash: await hashPassword("rigtig-kode"),
      },
    });
    await expect(
      authenticate({ email, password: "rigtig-kode" }, "1.1.1.1"),
    ).resolves.toMatchObject({ email, organizationId: a.org.id });
    await expect(
      authenticate({ email: email.toUpperCase(), password: "rigtig-kode" }, "1.1.1.1"),
    ).resolves.not.toBeNull();
    await expect(authenticate({ email, password: "forkert" }, "1.1.1.1")).resolves.toBeNull();
    await expect(
      authenticate({ email: "ukendt@test.dk", password: "x" }, "1.1.1.1"),
    ).resolves.toBeNull();
    await expect(
      authenticate({ email: "ikke-en-email", password: "x" }, "1.1.1.1"),
    ).resolves.toBeNull();
  });

  it("rate limits repeated attempts per email", async () => {
    const email = `brute-${Date.now()}@test.dk`;
    loginLimiterByIp.reset("9.9.9.9");
    for (let i = 0; i < 10; i++) {
      await expect(authenticate({ email, password: "x" }, "9.9.9.9")).resolves.toBeNull();
    }
    await expect(authenticate({ email, password: "x" }, "9.9.9.9")).rejects.toBeInstanceOf(
      LoginRateLimitedError,
    );
    loginLimiterByEmail.reset(email);
  });

  it("RateLimiter resets after the window", () => {
    let now = 0;
    const rl = new RateLimiter(2, 1000, () => now);
    expect(rl.hit("k")).toBe(true);
    expect(rl.hit("k")).toBe(true);
    expect(rl.hit("k")).toBe(false);
    expect(rl.isBlocked("k")).toBe(true);
    now = 1001;
    expect(rl.hit("k")).toBe(true);
  });
});
