import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { forOrg } from "@/lib/db/scoped";
import { seedDemo, DEMO_EMAIL, demoFilesDir } from "@/lib/seed/demo";
import { runMatching } from "@/lib/services/reconciliation";
import { dashboardOverview } from "@/lib/services/dashboard";
import { decodeCsvBytes } from "@/lib/bank-csv";
import type { SessionContext } from "@/lib/auth/session";

describe("demo seed", () => {
  it("creates the full demo scenario and is safe to run twice", async () => {
    const summary = await seedDemo(prisma);
    expect(summary).toContain("2 clients, 25 documents, 120 bank transactions");
    expect(await seedDemo(prisma)).toContain("findes allerede");

    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } });
    const ctx: SessionContext = {
      userId: user.id,
      organizationId: user.organizationId,
      role: "OWNER",
      email: user.email,
      name: user.name,
      db: forOrg(user.organizationId),
    };
    const docs = await ctx.db.document.findMany();
    expect(docs).toHaveLength(25);
    expect(docs.every((d) => d.status === "EXTRACTED" && d.extractedBy === "mock")).toBe(true);
    expect(
      docs.every((d) => Array.isArray(d.extractionWarnings) && d.extractionWarnings.length === 0),
    ).toBe(true);

    // Generated files are real PDFs and the CSVs parse.
    const dir = demoFilesDir();
    const pdf = fs.readFileSync(path.join(dir, "nordlys", "bilag", "gls-faktura-90881234.pdf"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const csv = fs.readFileSync(path.join(dir, "kaffe", "kaffekompagniet-nordea-sep-okt-2026.csv"));
    expect(decodeCsvBytes(csv).encoding).toBe("utf-8-bom");

    const clients = await ctx.db.client.findMany({ orderBy: { name: "asc" } });
    expect(clients.map((c) => c.name)).toEqual(["Kaffekompagniet IVS", "Nordlys Webshop ApS"]);
    const kaffe = await runMatching(ctx, clients[0]!.id);
    const nordlys = await runMatching(ctx, clients[1]!.id);
    expect(kaffe.suggested).toBe(10);
    expect(nordlys.suggested).toBe(14); // Kontorland receipt has no bank transaction
    expect(nordlys.highConfidence).toBe(13); // Shopify USD charge needs a check

    const shopify = await ctx.db.match.findFirstOrThrow({
      where: { document: { originalFilename: "shopify-faktura-2026-09.pdf" } },
    });
    expect(shopify.score).toBeLessThan(85);
    expect((shopify.reasons as string[])[0]).toMatch(/^Fremmed valuta: 79,00 USD/);
    expect(shopify).toMatchObject({ suggestedAccount: "3610", suggestedVatCode: "IEUY" });

    const overview = await dashboardOverview(ctx);
    const n = overview.find((o) => o.name === "Nordlys Webshop ApS")!;
    expect(n).toMatchObject({
      awaitingReview: 14,
      unmatchedDocuments: 15,
      failedDocuments: 0,
      lastExportAt: null,
    });
  });
});
