import path from "node:path";
import os from "node:os";

process.env.DATABASE_URL = "file:./test.db";
process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "bilagsmatch-test-storage");
process.env.ANTHROPIC_API_KEY = "";
process.env.EXTRACTION_WORKER_ENABLED = "false";
