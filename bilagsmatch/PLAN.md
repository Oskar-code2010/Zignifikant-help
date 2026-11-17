# Bilagsmatch – Plan

Legend: [x] done and verified, [ ] open.

## M1 Scaffold

- [x] package.json with pinned versions, all scripts
- [x] TS strict, Tailwind v4, shadcn-style UI primitives (hand-written; registry is not reachable)
- [x] Prisma + SQLite, ESLint flat config + Prettier, Vitest, Playwright
- [x] Hello-world e2e passes

## M2 Data model, auth, org scoping

- [x] Prisma schema (all entities, organizationId on every tenant row)
- [x] Auth.js credentials provider, bcrypt, JWT session cookie, login rate limiting
- [x] Protected layout, login/logout
- [x] `forOrg(orgId)` scoped Prisma client (injects organizationId into every query)
- [x] Isolation tests

## M3 Money/date utils + clients CRUD

- [x] parseDanishAmount / formatDKK + heavy tests
- [x] Date parsing/formatting (dd-mm-yyyy etc.)
- [x] CVR validation
- [x] Clients API + pages

## M4 Bank CSV import

- [x] Encoding detection (UTF-8, BOM, Windows-1252)
- [x] Delimiter / decimal / date format detection, header mapping, debit/credit
- [x] Preview + mapping UI, import with dedupe, per-row error report
- [x] Fixtures: Danske Bank, Nordea, Jyske Bank, Lunar, Spar Nord, cp1252, debit/credit; tests

## M5 Documents + extraction

- [x] Storage interface (local disk), magic-byte validation, sha256 duplicate detection
- [x] ExtractionProvider: Mock + Anthropic (Zod validated, retry once on validation, backoff on 429/5xx)
- [x] Sanity checks → warnings
- [x] DB-backed job queue + worker started from instrumentation.ts, UI polling
- [x] Document viewer with editable fields

## M6 Matching engine

- [x] Pure scoring (amount, date, text similarity, invoice number, direction)
- [x] Global greedy assignment
- [x] 30+ tests
- [x] "Kør afstemning" persists suggestions

## M7 Review screen

- [x] Three-pane layout, keyboard shortcuts, help overlay
- [x] Confirm / reject / manual match / ignore / missing receipt
- [x] Bulk confirm high-confidence with dialog
- [x] Audit log

## M8 Account/VAT suggestion + rules

- [x] Priority chain: CVR rule → name rule → bank text rule → keyword map
- [x] Rule learning on confirm
- [x] /regler and /kontoplan pages

## M9 Export

- [x] Generic, e-conomic-kompatibel, Dinero-kompatibel CSV presets (BOM, ;, decimal comma, dd-mm-yyyy)
- [x] Exported flags + re-export warning
- [x] Mangler bilag list + email text

## M10 Seed data

- [x] ~25 generated PDFs, 2 clients, bank CSVs with tricky cases, mock extraction data

## M11 Polish & hardening

- [x] Empty/loading/error states, a11y pass, security review, benchmark (500 tx × 200 docs < 2 s)

## M12 Docs

- [x] README with screenshots, setup, export format, architecture, privacy, limitations

## Added during the work

- [x] Duplicate uploads return 200 `{ duplicate: true }` instead of 409, so the browser console stays clean
- [x] Page guards (`requirePageContext`, `pageData`): pages redirect or 404 instead of throwing while rendering in parallel with the layout
- [x] Undo of a confirmed match (blocked once exported); deleting a document blocked once exported
- [x] "Spørg kunden" email text on the Mangler bilag page (the optional extra feature)
- [x] `.gitignore` fix (`/storage/`), `.env` loading for tsx scripts – both found by verifying from a fresh clone
- [x] Hydration fix for the dialog trigger + `npm run smoke:dev` dev-mode check
