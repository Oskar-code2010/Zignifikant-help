import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Generates README screenshots into docs/ (npm run docs:screenshots). Not part of the test suite. */
export default defineConfig({
  ...base,
  testDir: "scripts/screenshots",
  use: { ...base.use, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  projects: undefined,
});
