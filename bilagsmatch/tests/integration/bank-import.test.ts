import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as previewRoute from "@/app/api/clients/[clientId]/bank/preview/route";
import * as importRoute from "@/app/api/clients/[clientId]/bank/import/route";
import * as txRoute from "@/app/api/clients/[clientId]/bank/transactions/route";
import { actAs, call, createOrgWithUser } from "./helpers";
import { prisma } from "@/lib/db/client";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", "bank", name));

function form(name: string, options?: unknown): FormData {
  const fd = new FormData();
  fd.append("file", new File([fixture(name)], name, { type: "text/csv" }));
  if (options !== undefined) fd.append("options", JSON.stringify(options));
  return fd;
}

let a: Awaited<ReturnType<typeof createOrgWithUser>>;
let b: Awaited<ReturnType<typeof createOrgWithUser>>;
let clientA: string;

beforeAll(async () => {
  a = await createOrgWithUser("BankA");
  b = await createOrgWithUser("BankB");
  clientA = (await prisma.client.create({ data: { organizationId: a.org.id, name: "A", cvr: "11111111" } })).id;
});

type Preview = { options: Record<string, unknown>; preview: unknown[]; totals: { rows: number } };
type ImportResult = { imported: number; duplicates: number; failed: { line: number; reason: string }[] };

describe("bank import API", () => {
  it("previews and imports, then deduplicates a second import", async () => {
    actAs(a.user.id);
    const p = await call(previewRoute.POST, { method: "POST", params: { clientId: clientA }, formData: form("jyske-bank.csv") });
    expect(p.status).toBe(200);
    const preview = p.json as Preview;
    expect(preview.totals.rows).toBe(4);

    const opts = { ...preview.options, newBankAccountName: "Driftskonto" };
    const first = await call(importRoute.POST, {
      method: "POST",
      params: { clientId: clientA },
      formData: form("jyske-bank.csv", opts),
    });
    expect(first.status).toBe(201);
    expect(first.json as ImportResult).toMatchObject({ imported: 4, duplicates: 0, failed: [] });

    const second = await call(importRoute.POST, {
      method: "POST",
      params: { clientId: clientA },
      formData: form("jyske-bank.csv", opts),
    });
    expect(second.json as ImportResult).toMatchObject({ imported: 0, duplicates: 4 });
    expect(await prisma.bankTransaction.count({ where: { organizationId: a.org.id } })).toBe(4);
  });

  it("reports failed rows with reasons", async () => {
    actAs(a.user.id);
    const p = (await call(previewRoute.POST, { method: "POST", params: { clientId: clientA }, formData: form("broken-rows.csv") }))
      .json as Preview;
    const res = await call(importRoute.POST, {
      method: "POST",
      params: { clientId: clientA },
      formData: form("broken-rows.csv", { ...p.options, newBankAccountName: "Test" }),
    });
    const r = res.json as ImportResult;
    expect(r.imported).toBe(2);
    expect(r.failed.map((f) => f.line)).toEqual([3, 4, 5]);
  });

  it("rejects binary files and missing mapping", async () => {
    actAs(a.user.id);
    const fd = new FormData();
    fd.append("file", new File([Buffer.from("%PDF-1.7 xxx")], "x.csv"));
    expect((await call(previewRoute.POST, { method: "POST", params: { clientId: clientA }, formData: fd })).status).toBe(400);
    const bad = await call(importRoute.POST, {
      method: "POST",
      params: { clientId: clientA },
      formData: form("jyske-bank.csv", {
        delimiter: ";",
        decimal: ",",
        dateFormat: "dd-mm-yyyy",
        headerRowIndex: 0,
        mapping: { bookingDate: 0, valueDate: null, text: 2, amount: null, debit: null, credit: null, balance: null, currency: null },
      }),
    });
    expect(bad.status).toBe(400);
  });

  it("filters transactions", async () => {
    actAs(a.user.id);
    const res = await call(txRoute.GET, {
      params: { clientId: clientA },
      url: "http://localhost/x?q=Indbetaling&minOre=100000",
    });
    const list = (res.json as { transactions: { text: string }[] }).transactions;
    expect(list).toHaveLength(2);
  });

  it("org isolation: user B cannot preview, import into or list org A's client", async () => {
    actAs(b.user.id);
    expect((await call(previewRoute.POST, { method: "POST", params: { clientId: clientA }, formData: form("lunar.csv") })).status).toBe(404);
    expect(
      (await call(importRoute.POST, { method: "POST", params: { clientId: clientA }, formData: form("lunar.csv", {}) })).status,
    ).toBe(404);
    expect((await call(txRoute.GET, { params: { clientId: clientA } })).status).toBe(404);
    actAs(null);
    expect((await call(txRoute.GET, { params: { clientId: clientA } })).status).toBe(401);
  });
});
