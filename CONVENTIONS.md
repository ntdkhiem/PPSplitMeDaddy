# PPSplitMeDaddy conventions (read before changing code)

Self-hosted bill splitter for one household. SvelteKit 2 + Svelte 5 + TypeScript + Tailwind v4 +
SQLite (better-sqlite3 + Drizzle). Node 24.

## Commands
- `npm test` runs Vitest (node env, `src/**/*.test.ts`).
- `npm run check` runs svelte-check; must report 0 errors.
- `npx prettier --write <files>` formats only the files you touched.
- `npm run dev` starts the dev server. Data is in `./data` (`DATABASE_PATH`, `RECEIPTS_DIR`).
- Schema changes: edit `src/lib/server/db/schema.ts`, then `npx drizzle-kit generate --name <name>`.
  Only the lead does this; ask in your report instead.

## Rules
- **Money is integer cents everywhere.** Use `parseMoney` / `formatMoney` / `centsToInput` / `dollarsToCents`
  from `$lib/money`. Never use float math on money.
- **Dates** are `YYYY-MM-DD` strings (`today()` in `$lib/money`). Periods are `YYYY-MM`.
- **Balance sign:** positive = the member is owed money; negative = the member owes.
- **Server code** lives in `$lib/server/**`. Service functions take `db: DB` as the first argument, which keeps
  them testable with `createTestDb()`. Routes get the DB with `getDb()`.
- **Existing services** (reuse them, don't duplicate queries):
  - `services/members.ts`
  - `services/expenses.ts` (createExpense/updateExpense compute shares via `splitAmount`)
  - `services/payments.ts`
  - `services/balances.ts`
  - `ledger.ts` (pure math)
  - `auth.ts`, `receipts.ts`, `recurring.ts`, `import-xlsx.ts`
- **Keep the documented signatures and JSDoc contracts** in those files. If a contract must change, say so in
  your report.
- **Auth:** `hooks.server.ts` sets `locals.member` (a `MemberView`) and redirects anonymous users to `/login`.
  - Any logged-in member may create/edit/delete expenses, payments and recurring templates.
  - Only `role === 'admin'` may manage members and run imports. Check with `error(403)` in load/actions.
- **Forms:**
  - Use SvelteKit form actions + `use:enhance`. Validate with Zod (`zod` v4).
  - Return `fail(400, { errors, values })` so the form re-renders with the user's input.
  - Never trust hidden inputs for authorization.
- **Svelte 5 runes only:** `$props`, `$state`, `$derived`, `$effect`, `{@render}`, `onclick`
  (no `export let`, no `on:click`).
- **UI:**
  - Use the shared classes in `src/routes/layout.css`: `page`, `page-title`, `card`, `label`, `input`,
    `btn btn-primary|btn-secondary|btn-danger`, `error-text`, `muted`, `amount-pos`, `amount-neg`.
  - Must be mobile-friendly (≥ 360px wide) and use semantic HTML with labels.
  - Deletions use a POST form, not a link.
- **Tests:** colocated `*.test.ts`. Use `createTestDb()` for DB tests; never touch `./data`.
- **Dependencies:** don't add dependencies or edit `package.json` / config files; request it in your report.
- **File ownership:** only edit the files assigned to you. Other agents are working in parallel in the same
  tree, so ignore `npm run check` errors in files you don't own.
