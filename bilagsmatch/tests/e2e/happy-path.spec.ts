import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, trackConsole } from "./helpers";

const DEMO = path.resolve(__dirname, "..", "..", "storage", "demo-files", "nordlys");
const PDFS = ["gls-faktura-90881234.pdf", "dao-faktura-771203.pdf", "postnord-faktura-2026-09.pdf"].map((f) =>
  path.join(DEMO, "bilag", f),
);
const BANK_CSV = path.join(DEMO, "nordlys-danske-bank-sep-okt-2026.csv");

test("full flow: client → upload → extract → bank import → match → confirm → bulk confirm → export", async ({ page }) => {
  const assertClean = trackConsole(page);
  await login(page);

  // Create client
  await page.getByRole("link", { name: "Klienter" }).click();
  await page.getByRole("button", { name: "Opret klient" }).click();
  await page.getByLabel("Navn").fill("E2E Webshop ApS");
  await page.getByLabel("CVR-nummer").fill("123");
  await page.getByRole("dialog").getByRole("button", { name: "Opret klient" }).click();
  await expect(page.getByText("CVR-nummer skal være 8 cifre.")).toBeVisible();
  await page.getByLabel("CVR-nummer").fill("12345678");
  await page.getByRole("dialog").getByRole("button", { name: "Opret klient" }).click();
  await expect(page.getByTestId("client-name")).toHaveText("E2E Webshop ApS");
  await expect(page).toHaveURL(/\/klienter\/[a-z0-9]+\/bilag$/);

  // Upload 3 PDFs and wait for mock extraction
  await page.getByTestId("document-input").setInputFiles(PDFS);
  const docs = page.getByTestId("documents-table");
  await expect(docs.getByRole("row")).toHaveCount(4, { timeout: 30_000 });
  await expect(docs.getByText("Aflæst")).toHaveCount(3, { timeout: 30_000 });
  await expect(docs.getByText("GLS Denmark A/S")).toBeVisible();
  await expect(docs.getByText("1.875,00 kr.")).toBeVisible();

  // Uploading the same file again is detected as a duplicate
  await page.getByTestId("document-input").setInputFiles(PDFS[0]!);
  await expect(page.getByText(/allerede uploadet/)).toBeVisible();

  // Bank import through mapping preview
  await page.getByRole("link", { name: "Bank" }).click();
  await page.getByTestId("bank-csv-input").setInputFiles(BANK_CSV);
  const preview = page.getByTestId("bank-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Ligner Danske Bank-eksport")).toBeVisible();
  await expect(page.getByLabel("Bogføringsdato")).toHaveValue("0");
  await expect(page.getByLabel("Datoformat")).toHaveValue("dd.mm.yyyy");
  await page.getByRole("button", { name: /Importér 60 rækker/ }).click();
  await expect(page.getByTestId("import-result")).toContainText("60 importeret");
  await expect(page.getByTestId("transactions-table").getByRole("row")).toHaveCount(61);

  // Run matching
  await page.getByRole("link", { name: "Afstemning" }).click();
  await page.getByTestId("run-matching").click();
  await expect(page.getByText(/Afstemning kørt: 3 forslag/)).toBeVisible();
  await expect(page.getByTestId("review-stats")).toContainText("3 forslag");
  await expect(page.getByTestId("match-reasons")).toContainText("Beløb matcher præcist");

  // Confirm the first suggestion with the keyboard
  await page.locator("body").press("?");
  await expect(page.getByRole("heading", { name: "Tastaturgenveje" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("body").press("Enter");
  await expect(page.getByText("Match bekræftet og bogført i kladden.")).toBeVisible();
  await expect(page.getByTestId("review-stats")).toContainText("2 forslag");

  // Bulk confirm the rest
  await page.getByRole("button", { name: /Bekræft alle med høj sikkerhed \(2\)/ }).click();
  await expect(page.getByTestId("bulk-preview")).toContainText("2 match");
  await page.getByRole("button", { name: "Bekræft 2" }).click();
  await expect(page.getByText("2 match bekræftet.")).toBeVisible();
  await expect(page.getByTestId("review-stats")).toContainText("0 forslag");

  // Export
  await page.getByRole("link", { name: "Eksport" }).click();
  await expect(page.getByTestId("export-preview").getByRole("row")).toHaveCount(5); // header + 3 + total
  await page.getByLabel("Format").selectOption("economic");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Eksportér CSV \(3\)/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("kassekladde_e2e-webshop-aps_economic.csv");
  const file = await download.path();
  const bytes = fs.readFileSync(file);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = bytes.toString("utf8").slice(1).trimEnd().split("\r\n");
  expect(lines[0]).toBe("Dato;Bilagsnr.;Konto;Tekst;Beløb;Modkonto;Momskode");
  expect(lines).toHaveLength(4);
  const body = lines.slice(1).join("\n");
  expect(body).toContain("GLS Denmark A/S – Faktura 90881234;1875,00;5810;I25");
  expect(body).toContain("DAO A/S – Faktura 771203;980,00;5810;I25");
  expect(body).toContain("PostNord Danmark A/S – Faktura PN-7720015583;2340,00;5810;I25");
  expect(body).toMatch(/^\d{2}-\d{2}-2026;\d;1350;/m);

  // Re-exporting warns
  await expect(page.getByText("3 posteringer i perioden er allerede eksporteret.")).toBeVisible();

  assertClean();
});

test("reject a suggestion and match manually", async ({ page }) => {
  const assertClean = trackConsole(page);
  await login(page);
  await page.getByRole("link", { name: "Kaffekompagniet IVS" }).click();
  await expect(page).toHaveURL(/afstemning/);
  await page.getByTestId("run-matching").click();
  await expect(page.getByTestId("review-stats")).toContainText("10 forslag");

  // Navigate with J/K
  const current = page.getByTestId("current-transaction");
  const first = await current.textContent();
  await page.locator("body").press("j");
  await expect(current).not.toHaveText(first ?? "");
  await page.locator("body").press("k");
  await expect(current).toHaveText(first ?? "");

  // Reject the first suggestion
  const text = (await current.locator("p").nth(1).textContent()) ?? "";
  await page.locator("body").press("r");
  await expect(page.getByText("Forslaget er afvist.")).toBeVisible();
  await expect(page.getByTestId("review-stats")).toContainText("9 forslag");

  // Go back to the rejected transaction and match it manually
  await page.getByRole("list", { name: "Åbne posteringer" }).getByRole("button", { name: text }).click();
  await expect(page.getByText("Intet bilagsforslag til denne postering")).toBeVisible();
  await page.locator("body").press("m");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Find bilag manuelt" })).toBeVisible();
  const candidates = dialog.getByTestId("manual-candidates").getByRole("button");
  await expect(candidates.first()).toBeVisible();
  await candidates.first().click();
  await expect(dialog.getByLabel("Konto")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Match og bekræft" }).click();
  await expect(page.getByText("Manuelt match gemt og bogført i kladden.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Åbne posteringer" }).getByRole("button", { name: text })).toHaveCount(0);

  // Ignore an internal transfer
  await page.getByRole("list", { name: "Åbne posteringer" }).getByRole("button", { name: /Overførsel til skattekonto/ }).click();
  await page.getByRole("button", { name: "Ignorer" }).click();
  await expect(page.getByText("Posteringen ignoreres.")).toBeVisible();

  // Mangler bilag shows the Netto purchase and an email draft
  await page.getByRole("link", { name: "Mangler bilag" }).click();
  await expect(page.getByTestId("missing-table")).toContainText("Dankort-køb Netto Aarhus C");
  await expect(page.getByTestId("missing-email")).toContainText("Emne: Manglende bilag – Kaffekompagniet IVS");

  // The learned rule shows up on the Regler page
  await page.getByRole("link", { name: "Regler" }).click();
  await expect(page.getByRole("heading", { name: "Regler" })).toBeVisible();
  await expect(page.getByText("Lært").first()).toBeVisible();

  assertClean();
});

test("org pages render: dashboard, kontoplan, indstillinger, document viewer", async ({ page }) => {
  const assertClean = trackConsole(page);
  await login(page);
  await expect(page.getByTestId("dashboard-table")).toContainText("Nordlys Webshop ApS");
  await page.getByRole("link", { name: "Kontoplan" }).click();
  await expect(page.getByRole("cell", { name: "3610" })).toBeVisible();
  await expect(page.getByLabel("Navn på momskode IEUY")).toHaveValue("EU-køb af ydelser (omvendt betalingspligt)");
  await page.getByRole("link", { name: "Indstillinger" }).click();
  await expect(page.getByTestId("ai-status")).toContainText("Demo-tilstand");

  await page.getByRole("link", { name: "Klienter" }).click();
  await page.getByRole("link", { name: "Nordlys Webshop ApS" }).click();
  await page.getByRole("link", { name: "emballagehuset-faktura-2026-118.pdf" }).click();
  await expect(page.getByLabel("Leverandør", { exact: true })).toHaveValue("Emballagehuset Vest A/S");
  await expect(page.getByLabel("Total inkl. moms")).toHaveValue("3781,25");
  await expect(page.locator("iframe[title^='Forhåndsvisning']")).toBeVisible();
  assertClean();
});
