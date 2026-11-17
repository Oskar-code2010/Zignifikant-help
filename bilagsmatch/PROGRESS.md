# Progress

## Final summary

Bilagsmatch is a working MVP covering every milestone in the brief. All checks were run and verified from a **fresh clone** of the branch:

| Check                                                   | Result                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm install` → `cp .env.example .env` → migrate + seed | ✅ 2 clients, 25 generated PDFs (all extracted by the mock), 120 bank transactions                        |
| `npm run typecheck`                                     | ✅ 0 errors (TypeScript strict + `noUncheckedIndexedAccess`)                                              |
| `npm run lint`                                          | ✅ 0 errors, 0 warnings (no `any`, no `@ts-ignore`)                                                       |
| `npm run build`                                         | ✅                                                                                                        |
| `npm test`                                              | ✅ 16 files, **240 tests**                                                                                |
| `npm run test:e2e`                                      | ✅ 6 Playwright tests, including the full happy path and reject + manual re-match, with no console errors |
| `npm run dev` + demo login + `npm run smoke:dev`        | ✅ no console errors or hydration warnings                                                                |
| Benchmark: 500 transactions × 200 documents             | ✅ ~6 ms in the pure engine, ~50 ms end-to-end with the database (limit: 2 s)                             |

**Coverage** (`npm test -- --coverage`, scope `src/lib/**`): statements **93.9 %**, branches **86.8 %**, functions **94.4 %**, lines **93.9 %**. Matching 99.5 %, bank CSV 97 %, export 100 %, categorization 100 %, money/dates ~95 %. Lower coverage: `lib/auth/options.ts` (next-auth wiring, covered by e2e), `lib/jobs/worker.ts` (the long-running loop, also covered by e2e), and `lib/client/api.ts` (browser-only).

**The demo works offline in under 2 minutes:** log in → Nordlys Webshop ApS → _Kør afstemning_ (14 suggestions, 13 marked high confidence; the USD Shopify charge is marked "Tjek venligst" with an explanation) → confirm with `Enter` or _Bekræft alle med høj sikkerhed_ → _Eksport_ → CSV.

**One thing a person must do:** run `npm run db:reset` yourself. Prisma 6 refuses `migrate reset` when it detects an AI agent, and I did not bypass that guard (see DECISIONS.md #7). I verified the same steps on a fresh database (`prisma migrate deploy` + `npm run db:seed`).

**Bugs found by the final verification and fixed:**

1. `.gitignore` had `storage/`, which also excluded `src/lib/storage/`, so a fresh clone would not have compiled. Fixed by changing it to `/storage/`.
2. `tsx prisma/seed.ts` did not load `.env` in a fresh clone. Fixed by loading `.env` explicitly in the seed.
3. A hydration mismatch in dev mode on `/klienter`: a server-rendered element was passed into a Radix `Slot`. Fixed, and added `npm run smoke:dev` so it stays fixed.

See "Known limitations" below and in README.md.

---

## Milestone log

### M1 Scaffold ✅

Next.js 16.4.6 (App Router), React 19.2, TypeScript 5.9 strict, Tailwind 4, Prisma 6.19 + SQLite, ESLint 9 flat config + Prettier, Vitest 3.2, Playwright 1.63 (matches the pre-installed Chromium). All scripts in the brief exist, plus `demo:check`, `docs:screenshots` and `smoke:dev`. shadcn/ui components are hand-written because the registry is blocked from this environment (DECISIONS #3).

### M2 Data model, auth, org scoping ✅

- The Prisma schema has every entity from the brief, plus `Job` (queue) and `Client.bankLedgerAccount`. Every tenant row has `organizationId`. Money is `Int` øre.
- Auth.js (next-auth 4) credentials provider with bcrypt, JWT in an HTTP-only cookie (8 h), and in-memory login rate limiting.
- `forOrg(orgId)` is a Prisma extension that injects the organization into every query. Tests show that cross-org reads return nothing and that cross-org creates, filters and moves throw.
- **Tested:** isolation on every route group (clients, bank, documents, files, review/matching, matches, transactions, export, rules, accounts, VAT codes, organization, users), 401 for anonymous requests everywhere, 403 for members on owner-only actions.

### M3 Money/date utilities + clients CRUD ✅

- `parseDanishAmount` / `formatDKK` (65 tests: thousands separators, spaces/nbsp, kr./DKK, leading/trailing/unicode minus, parentheses, decimal point, auto-detection, rounding, overflow), date parsing in 5 formats with real calendar validation, CVR validation.
- Clients CRUD with CVR validation and GDPR delete (typed confirmation; rows and files removed).

### M4 Bank CSV import ✅

- Encoding (UTF-8, BOM, Windows-1252), delimiter, decimal, date format, header row and mapping detection (Danish synonyms, files without a header, Ud/Ind columns), and skipping of junk/summary lines.
- Preview with dropdown mapping, import report (imported / duplicates / failed with line numbers and reasons), dedupe hash with occurrence counter.
- **Tested:** 7 fixtures (Danske Bank-style in Windows-1252, Nordea-style with BOM, Jyske, Lunar with comma delimiter and decimal point, Spar Nord-style with Ud/Ind and preamble, no header, broken rows) plus detection unit tests and integration tests (preview → import → re-import = all duplicates).

### M5 Documents + extraction ✅

- Magic-byte validation, 20 MB limit (checked in the browser and on the server), SHA-256 duplicate detection, randomized storage keys protected against path traversal, and an authenticated file route.
- `ExtractionProvider` with two implementations:
  - Mock: deterministic; correct data for the sample PDFs; a filename-based guess with 35 % confidence for other files.
  - Anthropic: document/image blocks, JSON-schema structured output, Zod validation with one corrective retry, exponential backoff, readable Danish errors, encrypted-PDF detection.
- Sanity checks produce warnings and never block. A DB job queue with an in-process worker; the UI polls. The document viewer shows a PDF/image preview next to editable fields.
- **Tested:** the Anthropic provider with a mocked SDK (success, image blocks, validation retry, double failure, 429/5xx backoff, giving up, timeout, auth error not retried, refusal, encrypted PDF), the mock for all 25 samples, the queue (claim once, backoff, permanent failure, stale-lock recovery), and the upload → extract → edit → retry → delete flow.

### M6 Matching engine ✅

Pure scoring (amount, date, text similarity, invoice number, direction, foreign currency) plus greedy one-to-one assignment. **38 unit tests** cover exact amounts, rounding, foreign currency (rate and text), same-amount pairs decided by date and by text, duplicate documents, credit notes, no match, many-to-few in both directions, messy bank texts, window edges, due dates, CVR in text, thresholds and determinism. Benchmark test included. "Kør afstemning" stores suggestions with Danish reasons and never re-suggests rejected pairs.

### M7 Review screen ✅

Three-pane layout (transaction and queue / document preview / data, reasons, account and VAT). Keyboard: `Enter`, `R`, `J/K/↑/↓`, `E`, `M`, plus `I` (ignore) and `B` (missing receipt), and a `?` help overlay. Bulk confirm with a dialog showing the count and total. Manual matching with ranked search. Ignore and missing receipt. Every action is written to the audit log (asserted in tests). Undo of confirmed matches that are not yet exported.

### M8 Account/VAT suggestion + rules ✅

Priority chain: CVR rule → name rule → bank-text rule → keyword map (~30 webshop suppliers) → none. Rule learning on confirm. `/regler` (create, edit, delete) and `/kontoplan` (edit accounts and VAT codes, add accounts). **Tested** with 13 unit tests plus integration tests (a learned rule pre-fills the next document from the same supplier).

### M9 Export ✅

Generic, e-conomic-compatible and Dinero-compatible presets. BOM, `;`, decimal comma, `dd-mm-yyyy`, CRLF, CSV-injection guard. Entries are marked as exported; re-export requires an explicit opt-in. The "Mangler bilag" list comes with a ready-made email text for the client. **Tested:** exact output strings and bytes, filenames, and the API (headers, BOM, flags, warning, isolation).

### M10 Seed data ✅

25 PDFs generated with pdf-lib (invoices, receipts, a credit note; Danish layout, VAT lines, invoice numbers), 2 clients, about 60 bank lines each in Danske Bank and Nordea style. Tricky cases included: identical amounts (PostNord porto ×2; Canva/Dropbox 99,00), foreign currency (USD Shopify and Klaviyo, EUR roastery), a payment 30 days after the due date, a transaction without a receipt, a receipt without a transaction (Kontorland), a credit-note refund, internal transfers and an owner deposit. Demo files are also written to `storage/demo-files/`. **Tested** by an integration test and by e2e.

### M11 Polish and hardening ✅

Loading skeletons, error boundary, not-found pages, empty states with Danish help text, toasts with actionable messages. Security review against section 9: bcrypt, HTTP-only cookies, auth on every route and page, magic bytes, size limit, random file names, authenticated file serving with `nosniff`/`no-store`, login rate limit, no sensitive logging, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), and `.env` gitignored. Accessibility: labels on all inputs, focus rings, keyboard-navigable lists and dialogs (Radix), `aria-current` and `aria-live` where needed. Benchmark test added.

### M12 Docs ✅

README: what it is, 10 Playwright screenshots in `docs/`, setup in 5 commands, the 2-minute demo, how to enable real AI, CSV import, matching, export format details (with a note to verify against each system's current spec), architecture, security, privacy (Anthropic as sub-processor), known limitations and next steps. DECISIONS.md lists 19 recorded decisions.

### Optional extra ✅

"Spørg kunden": the Mangler bilag page generates a Danish email listing the missing receipts, with a copy button.

---

## Known limitations

- Fixed approximate foreign-exchange rates (except when the bank text contains the original amount).
- One-to-one matching only: no split or combined payments.
- In-memory rate limiter and in-process worker assume a single server instance.
- No email invitations or password reset; owners create users with a temporary password.
- The export presets are not certified against e-conomic, Dinero or Billy; verify against their current import specification.
- Headless screenshots show an empty PDF pane because Chromium headless has no PDF viewer. Real browsers render it, and an "Åbn i ny fane" link is available.
- `npm run db:reset` must be run by a person (Prisma's AI-agent guard).
- `npm audit --omit=dev` reports one remaining advisory: `deepmerge-ts` (<8), which is used only by the Prisma CLI's config loader (`@prisma/config`) and never processes user input. The fix requires a Prisma major upgrade, so I did not run `npm audit fix --force`. Zod was upgraded to 4.6.7 to fix its advisory.
