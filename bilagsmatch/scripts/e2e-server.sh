#!/usr/bin/env bash
# Starts a production build of the app on port 3100 against a throwaway e2e database.
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="file:./e2e.db"
export STORAGE_DIR="./storage/e2e-uploads"
export ANTHROPIC_API_KEY=""
export NEXTAUTH_URL="http://localhost:3100"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-e2e-secret-e2e-secret-e2e-secret}"
rm -f prisma/e2e.db prisma/e2e.db-journal
rm -rf storage/e2e-uploads
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts
if [ "${E2E_SKIP_BUILD:-}" != "1" ]; then
  npx next build
fi
exec npx next start -p 3100
