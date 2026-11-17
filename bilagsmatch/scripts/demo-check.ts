/** Dev helper: run matching on the seeded demo data and print the suggestions (read-only report). */
import "../prisma/load-env";
import { prisma } from "../src/lib/db/client";
import { forOrg } from "../src/lib/db/scoped";
import { matchAll } from "../src/lib/matching";
import { formatDKK } from "../src/lib/money";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "demo@bilagsmatch.dk" } });
  const db = forOrg(user.organizationId);
  for (const client of await db.client.findMany()) {
    const docs = await db.document.findMany({
      where: { clientId: client.id, status: "EXTRACTED" },
    });
    const txs = await db.bankTransaction.findMany({
      where: { bankAccount: { clientId: client.id } },
    });
    const res = matchAll(docs, txs);
    console.info(
      `\n== ${client.name}: ${docs.length} docs, ${txs.length} tx, ${res.length} matches`,
    );
    for (const m of res) {
      const d = docs.find((x) => x.id === m.documentId)!;
      const t = txs.find((x) => x.id === m.transactionId)!;
      console.info(
        `${String(m.score).padStart(3)}  ${d.originalFilename.padEnd(42)} ↔ ${t.text.slice(0, 40).padEnd(40)} ${formatDKK(t.amountOre)}`,
      );
    }
    const unmatched = docs.filter((d) => !res.some((m) => m.documentId === d.id));
    console.info("Unmatched docs:", unmatched.map((d) => d.originalFilename).join(", ") || "none");
  }
}
main().finally(() => prisma.$disconnect());
