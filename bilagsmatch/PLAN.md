# Bilagsmatch – Plan

Legend: [x] done and verified, [ ] open.

## M1 Scaffold

- [ ] package.json with pinned versions, all scripts
- [ ] TS strict, Tailwind v4, shadcn-style UI primitives (hand-written; registry is not reachable)
- [ ] Prisma + SQLite, ESLint flat config + Prettier, Vitest, Playwright
- [ ] Hello-world e2e passes

## M2 Data model, auth, org scoping

- [ ] Prisma schema (all entities, organizationId on every tenant row)
- [ ] Auth.js credentials provider, bcrypt, JWT session cookie, login rate limiting
- [ ] Protected layout, login/logout
- [ ] `forOrg(orgId)` scoped Prisma client (injects organizationId into every query)
- [ ] Isolation tests

## M3 Money/date utils + clients CRUD

- [ ] parseDanishAmount / formatDKK + heavy tests
- [ ] Date parsing/formatting (dd-mm-yyyy etc.)
- [ ] CVR validation
- [ ] Clients API + pages

## M4 Bank CSV import

- [ ] Encoding detection (UTF-8, BOM, Windows-1252)
- [ ] Delimiter / decimal / date format detection, header mapping, debit/credit
- [ ] Preview + mapping UI, import with dedupe, per-row error report
- [ ] Fixtures: Danske Bank, Nordea, Jyske Bank, Lunar, Spar Nord, cp1252, debit/credit; tests

## M5 Documents + extraction

- [ ] Storage interface (local disk), magic-byte validation, sha256 duplicate detection
- [ ] ExtractionProvider: Mock + Anthropic (Zod validated, retry once on validation, backoff on 429/5xx)
- [ ] Sanity checks → warnings
- [ ] DB-backed job queue + worker started from instrumentation.ts, UI polling
- [ ] Document viewer with editable fields

## M6 Matching engine

- [ ] Pure scoring (amount, date, text similarity, invoice number, direction)
- [ ] Global greedy assignment
- [ ] 30+ tests
- [ ] "Kør afstemning" persists suggestions

## M7 Review screen

- [ ] Three-pane layout, keyboard shortcuts, help overlay
- [ ] Confirm / reject / manual match / ignore / missing receipt
- [ ] Bulk confirm high-confidence with dialog
- [ ] Audit log

## M8 Account/VAT suggestion + rules

- [ ] Priority chain: CVR rule → name rule → bank text rule → keyword map
- [ ] Rule learning on confirm
- [ ] /regler and /kontoplan pages

## M9 Export

- [ ] Generic, e-conomic-kompatibel, Dinero-kompatibel CSV presets (BOM, ;, decimal comma, dd-mm-yyyy)
- [ ] Exported flags + re-export warning
- [ ] Mangler bilag list + email text

## M10 Seed data

- [ ] ~25 generated PDFs, 2 clients, bank CSVs with tricky cases, mock extraction data

## M11 Polish & hardening

- [ ] Empty/loading/error states, a11y pass, security review, benchmark (500 tx × 200 docs < 2 s)

## M12 Docs

- [ ] README with screenshots, setup, export format, architecture, privacy, limitations
