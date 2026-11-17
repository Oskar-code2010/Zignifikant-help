import { expect, type Page } from "@playwright/test";

export const DEMO = { email: "demo@bilagsmatch.dk", password: "demo1234" };

/** Collect console errors and hydration warnings; assert none at the end of a test. */
export function trackConsole(page: Page): () => void {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || /hydrat/i.test(text)) problems.push(`${msg.type()}: ${text}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  return () => expect(problems, problems.join("\n")).toEqual([]);
}

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(DEMO.email);
  await page.getByLabel("Adgangskode").fill(DEMO.password);
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page.getByRole("heading", { name: "Overblik" })).toBeVisible();
}
