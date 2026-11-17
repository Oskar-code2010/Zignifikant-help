/**
 * Dev-mode smoke check (hydration warnings only show in development builds).
 * Start `npm run dev` first, then run `npm run smoke:dev`. Fails on console errors or hydration warnings.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const issues: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text()))
      issues.push(m.text().split("\n")[0] ?? "");
  });
  page.on("pageerror", (e) => issues.push(e.message.split("\n")[0] ?? ""));
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill("demo@bilagsmatch.dk");
  await page.getByLabel("Adgangskode").fill("demo1234");
  await page.getByRole("button", { name: "Log ind" }).click();
  await page.getByRole("heading", { name: "Overblik" }).waitFor({ timeout: 60_000 });
  for (const path of ["/klienter", "/regler", "/kontoplan", "/indstillinger"]) {
    await page.goto(BASE + path);
    await page.waitForLoadState("load");
  }
  await page.goto(`${BASE}/klienter`);
  await page.getByRole("link", { name: "Nordlys Webshop ApS" }).click();
  await page.getByTestId("documents-table").waitFor({ timeout: 60_000 });
  for (const tab of ["Bank", "Afstemning", "Eksport", "Mangler bilag"]) {
    await page.getByRole("link", { name: tab, exact: true }).click();
    await page.waitForTimeout(3000);
  }
  await browser.close();
  if (issues.length > 0) {
    console.error(`Dev smoke check found ${issues.length} problem(s):\n${issues.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.info("Dev smoke check passed: no console errors or hydration warnings.");
  }
}

void main();
