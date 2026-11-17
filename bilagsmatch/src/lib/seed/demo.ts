import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { provisionOrganizationDefaults } from "@/lib/accounting/provision";
import { forOrg } from "@/lib/db/scoped";
import { getStorage } from "@/lib/storage";
import { extractDocument } from "@/lib/services/extraction";
import { MockExtractionProvider } from "@/lib/extraction/mock-provider";
import { importBankCsv, previewBankCsv } from "@/lib/services/bank";
import type { SessionContext } from "@/lib/auth/session";
import { SAMPLE_DOCUMENTS, type ClientKey } from "./sample-documents";
import { renderSamplePdf, type Buyer } from "./pdf";
import { demoBankCsv } from "./bank-data";

export const DEMO_EMAIL = "demo@bilagsmatch.dk";
export const DEMO_PASSWORD = "demo1234";

export const DEMO_CLIENTS: Record<ClientKey, Buyer & { notes: string }> = {
  nordlys: {
    name: "Nordlys Webshop ApS",
    cvr: "41234567",
    address: "Strandvejen 12, 6700 Esbjerg",
    notes: "Webshop med lamper og boligtilbehør. Shopify + QuickPay. Bank: Danske Bank.",
  },
  kaffe: {
    name: "Kaffekompagniet IVS",
    cvr: "39876543",
    address: "Mejlgade 41, 8000 Aarhus C",
    notes: "Kafferisteri med webshop. Stripe + MobilePay. Bank: Nordea.",
  },
};

/** Where demo PDFs and CSVs are written so they can be dragged into the app (and used by e2e tests). */
export function demoFilesDir(): string {
  return path.resolve(process.env.DEMO_FILES_DIR ?? "./storage/demo-files");
}

/** Write the sample PDFs and bank CSVs to disk. Returns the directory. */
export async function writeDemoFiles(): Promise<string> {
  const dir = demoFilesDir();
  for (const key of Object.keys(DEMO_CLIENTS) as ClientKey[]) {
    const clientDir = path.join(dir, key);
    await fs.mkdir(path.join(clientDir, "bilag"), { recursive: true });
    for (const doc of SAMPLE_DOCUMENTS.filter((d) => d.client === key)) {
      await fs.writeFile(
        path.join(clientDir, "bilag", doc.filename),
        await renderSamplePdf(doc, DEMO_CLIENTS[key]),
      );
    }
    const csv = demoBankCsv(key);
    await fs.writeFile(path.join(clientDir, csv.filename), csv.content, "utf8");
  }
  return dir;
}

/** Create the demo organization, user, clients, documents and bank data. Refuses to run twice. */
export async function seedDemo(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    return "Demo-data findes allerede – kør `npm run db:reset` for at starte forfra.";
  }
  const org = await prisma.organization.create({ data: { name: "Zignifikant Demo" } });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: DEMO_EMAIL,
      name: "Demo Bogholder",
      role: "OWNER",
      passwordHash: await hashPassword(DEMO_PASSWORD),
    },
  });
  await provisionOrganizationDefaults(prisma, org.id);

  const ctx: SessionContext = {
    userId: user.id,
    organizationId: org.id,
    role: "OWNER",
    email: user.email,
    name: user.name,
    db: forOrg(org.id),
  };
  const storage = getStorage();
  const provider = new MockExtractionProvider();
  let documents = 0;
  let transactions = 0;

  for (const key of Object.keys(DEMO_CLIENTS) as ClientKey[]) {
    const info = DEMO_CLIENTS[key];
    const client = await ctx.db.client.create({
      data: { organizationId: org.id, name: info.name, cvr: info.cvr, notes: info.notes },
    });

    for (const sample of SAMPLE_DOCUMENTS.filter((d) => d.client === key)) {
      const bytes = Buffer.from(await renderSamplePdf(sample, info));
      const storagePath = await storage.put({
        organizationId: org.id,
        clientId: client.id,
        extension: "pdf",
        bytes,
      });
      const doc = await ctx.db.document.create({
        data: {
          organizationId: org.id,
          clientId: client.id,
          originalFilename: sample.filename,
          storagePath,
          mimeType: "application/pdf",
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      });
      await extractDocument(org.id, doc.id, { provider, finalAttempt: true });
      documents++;
    }

    // Import the bank CSV through the same code path as the UI (detect → preview → import).
    const csv = demoBankCsv(key);
    const file = () => new File([csv.content], csv.filename, { type: "text/csv" });
    const previewForm = new FormData();
    previewForm.append("file", file());
    const preview = await previewBankCsv(ctx, client.id, previewForm);
    const importForm = new FormData();
    importForm.append("file", file());
    importForm.append(
      "options",
      JSON.stringify({
        ...preview.options,
        newBankAccountName: key === "nordlys" ? "Danske Bank drift" : "Nordea erhverv",
      }),
    );
    const res = await importBankCsv(ctx, client.id, importForm);
    transactions += res.imported;
  }

  const dir = await writeDemoFiles();
  return [
    `Seeded organization "${org.name}" with user ${DEMO_EMAIL} / ${DEMO_PASSWORD}.`,
    `${Object.keys(DEMO_CLIENTS).length} clients, ${documents} documents, ${transactions} bank transactions.`,
    `Demo files (PDFs + bank CSVs) written to ${dir}`,
  ].join("\n");
}
