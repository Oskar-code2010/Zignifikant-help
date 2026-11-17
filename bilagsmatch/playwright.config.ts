import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    acceptDownloads: true,
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "bash scripts/e2e-server.sh",
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
