import { expect, test } from "@playwright/test";
import { login, trackConsole } from "./helpers";

test("redirects anonymous users to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("rejects a wrong password", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("demo@bilagsmatch.dk");
  await page.getByLabel("Adgangskode").fill("forkert");
  await page.getByRole("button", { name: "Log ind" }).click();
  await expect(page.getByText("Forkert e-mail eller adgangskode.")).toBeVisible();
});

test("logs in and out", async ({ page }) => {
  const assertClean = trackConsole(page);
  await login(page);
  await expect(page.getByTestId("demo-badge")).toBeVisible();
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(page).toHaveURL(/\/login/);
  assertClean();
});
