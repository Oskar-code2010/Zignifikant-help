/** Load .env for CLI scripts run with tsx (Next.js and the Prisma CLI load it themselves). */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment (DATABASE_URL etc.).
}
