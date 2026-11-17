# Decisions

Decisions made while building without anyone to ask. Newest at the bottom.

1. **Project location / git.** The session already runs inside the git repository `Zignifikant-help`, on branch `claude/bilagsmatch-setup-8yawi8`. Instead of `git init` (which would create a nested repository) the app lives in the `bilagsmatch/` subfolder and is committed to that existing repository and branch.
2. **Versions.** Pinned exact versions. Chose mature, well-known majors over brand-new ones where the newest major is days old or a release candidate:
   - Next.js 16.4.6 (latest stable), React 19.2.3.
   - TypeScript 5.9.3 (TS 7 is the new native compiler; Next's type-check integration targets 5.x).
   - Prisma 6.19.3 (Prisma 8 is an RC; 7 requires driver adapters and a different generator). Enums and Json work on SQLite in 6.x and are Postgres compatible.
   - next-auth 4.24.15 (the `latest` tag; v5 / Auth.js is still beta). Credentials provider, JWT session in an HTTP-only cookie.
   - Vitest 3.2.4, ESLint 9.39.1 (flat config), Zod 4.1.12, Tailwind 4.1.16.
   - @playwright/test 1.63.0 to match the Chromium build pre-installed in this environment.
   - @anthropic-ai/sdk 1.5.0 (newest 1.x that has been out for ~2 weeks).
3. **shadcn/ui.** The shadcn registry (ui.shadcn.com) is blocked from this environment, so the shadcn components that are used (Button, Input, Label, Card, Badge, Dialog, Table, Textarea, Select) are written by hand in `src/components/ui/` following the shadcn source style (cva + tailwind-merge + Radix Dialog). Native `<select>` is used for dropdowns because it is fully accessible and keyboard friendly without extra dependencies.
4. **Tenant isolation.** Every tenant-owned table has an `organizationId` column (denormalised from Client where needed). `forOrg(organizationId)` returns a Prisma client extension that injects `organizationId` into the `where` of every read/update/delete and verifies it on every create. Route handlers only get data through this client. This makes forgetting a scope check a type/runtime error instead of a data leak.
5. **Money range.** Amounts are Prisma `Int` (32-bit) øre, i.e. max ±21.474.836,47 kr per amount. Larger amounts are rejected by validation with a clear message. Enough for receipts/bank lines of a small webshop; would move to BigInt for larger clients.
6. **Dates.** Date-only values (invoice date, booking date) are stored as `DateTime` at 00:00 UTC and always formatted in UTC, so there is no time-zone drift.
7. **`prisma migrate reset` and AI agents.** Prisma 6.x refuses to run `migrate reset` when it detects it is being run by an AI agent, unless the user gives explicit consent. I did not bypass that guard. `npm run db:reset` is still the conventional `prisma migrate reset --force` + seed, meant to be run by a human. The test suites never call it: they delete their own throwaway database file (`prisma/test.db`, `prisma/e2e.db`) and run `prisma migrate deploy`. I verified the reset flow with the equivalent non-destructive steps on a fresh database (`prisma migrate deploy` + `npm run db:seed`).
