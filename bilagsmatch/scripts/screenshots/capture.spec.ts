import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const OUT = path.resolve(__dirname, "..", "..", "docs");
const DEMO = path.resolve(__dirname, "..", "..", "storage", "demo-files", "nordlys");

async function shot(page: Page, name: string) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

test("capture README screenshots", async ({ page }) => {
  await page.goto("/login");
  await shot(page, "01-login");
  await page.getByLabel("E-mail").fill("demo@bilagsmatch.dk");
  await page.getByLabel("Adgangskode").fill("demo1234");
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page.getByRole("heading", { name: "Overblik" })).toBeVisible();

  await page.getByRole("link", { name: "Nordlys Webshop ApS" }).click();
  await page.getByTestId("run-matching").click();
  await expect(page.getByText(/Afstemning kørt/)).toBeVisible();
  await page.getByText(/Afstemning kørt/).waitFor({ state: "hidden", timeout: 10_000 });
  await shot(page, "04-afstemning");

  await page.locator("body").press("?");
  await shot(page, "05-genveje");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Bekræft alle med høj sikkerhed/ }).click();
  await expect(page.getByTestId("bulk-preview")).toBeVisible();
  await shot(page, "06-bulk");
  await page.getByRole("button", { name: /^Bekræft \d+$/ }).click();
  await expect(page.getByText(/match bekræftet/)).toBeVisible();

  await page.getByRole("link", { name: "Bilag", exact: true }).click();
  await shot(page, "02-bilag");
  await page.getByRole("link", { name: "emballagehuset-faktura-2026-118.pdf" }).click();
  await page.waitForTimeout(1500);
  await shot(page, "03-bilag-visning");

  await page.getByRole("link", { name: "Bank", exact: true }).click();
  await page
    .getByTestId("bank-csv-input")
    .setInputFiles(path.join(DEMO, "nordlys-danske-bank-sep-okt-2026.csv"));
  await expect(page.getByTestId("bank-preview")).toBeVisible();
  await shot(page, "07-bank-import");

  await page.getByRole("link", { name: "Eksport" }).click();
  await expect(page.getByTestId("export-preview")).toBeVisible();
  await shot(page, "08-eksport");

  await page.getByRole("link", { name: "Mangler bilag" }).click();
  await shot(page, "09-mangler-bilag");

  await page.getByRole("link", { name: "Overblik" }).click();
  await shot(page, "00-overblik");
});
