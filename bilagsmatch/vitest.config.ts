import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/env.ts", "tests/setup/mock-session.ts"],
    // Integration tests share one SQLite file; run files sequentially.
    fileParallelism: false,
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.d.ts"],
      reporter: ["text-summary", "text"],
    },
  },
});
