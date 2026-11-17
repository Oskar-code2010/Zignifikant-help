import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Create a fresh, throwaway SQLite test database (prisma/test.db) with all migrations applied.
 * The file is a test artifact owned by the test run, so it is simply deleted first.
 */
export default function setup(): void {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(path.join(__dirname, "..", "..", "prisma", `test.db${suffix}`), { force: true });
  }
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
