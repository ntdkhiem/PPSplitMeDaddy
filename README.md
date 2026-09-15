# PPSplitMeDaddy

A self-hosted, subscription-free bill splitter for one household. It replaces `1008 Ravenscourt Bills.xlsx`.

- Expenses split equally, by shares, or by exact amounts. Refunds are entered as negative expenses.
- Payments are ledger entries, so partial payments work.
- Live balances, plus a settle-up that needs at most n−1 transfers.
- Receipt photos/PDFs, monthly recurring bills (fixed or variable amount), and a one-time import from the spreadsheet.

Stack: SvelteKit 2 + Svelte 5, TypeScript, Tailwind v4, SQLite (better-sqlite3 + Drizzle), Node 24.
See `CONVENTIONS.md` for code rules.

## Run locally

```sh
npm install
npm run dev            # http://localhost:5173 -> first visit opens /setup
npm test               # unit tests
npm run check          # type check
```

On first run, `/setup` creates you as the admin and adds your roommates, who don't have logins yet.
To give a roommate a login, go to **Members → Invite link** and send them the link.
Admins can import the spreadsheet at **Import**.

## Configuration (env)

| Variable          | Default         | Notes                                                                          |
| ----------------- | --------------- | ------------------------------------------------------------------------------ |
| `DATABASE_PATH`   | `data/app.db`   | SQLite file; migrations run automatically on start                             |
| `RECEIPTS_DIR`    | `data/receipts` | uploaded receipts                                                              |
| `MIGRATIONS_DIR`  | `drizzle`       |                                                                                |
| `ORIGIN`          | —               | **required in production**, e.g. `https://ppsplitmedaddy.fly.dev` (CSRF check) |
| `BODY_SIZE_LIMIT` | `512K`          | set to `12M` in production so receipt uploads fit                              |
| `TZ`              | system          | recurring bills use local dates                                                |
| `COOKIE_SECURE`   | `true` in prod  | set `false` only if serving over plain HTTP on a LAN                           |

Production build without Docker:

```sh
npm run build
ORIGIN=http://localhost:3000 BODY_SIZE_LIMIT=12M node build
```

## Deploy (Fly.io, ~$3–5/mo)

```sh
fly launch --no-deploy --copy-config    # choose app name/region; update `app` + ORIGIN in fly.toml
fly volumes create data --size 1
fly deploy
```

One always-on machine with a 1 GB volume mounted at `/data`. SQLite and the in-process scheduler both
assume a single instance, so don't scale beyond 1 machine.

### Backups (optional, recommended)

Litestream continuously replicates the database to S3-compatible storage (Cloudflare R2 / Backblaze B2):

```sh
fly secrets set LITESTREAM_REPLICA_URL=s3://<bucket>/ppsplitmedaddy \
  LITESTREAM_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
  LITESTREAM_ACCESS_KEY_ID=... LITESTREAM_SECRET_ACCESS_KEY=...
```

On a fresh volume the container restores the database from the replica automatically.
Receipts aren't replicated by Litestream; snapshot the volume (`fly volumes snapshots`) or sync
`/data/receipts` separately.

## Notes

- iPhone HEIC photos can't be decoded by the bundled image library. Set the camera to "Most Compatible"
  or upload a JPEG/PNG.
- Importing the spreadsheet uses its **Bills** sheets only. The imported balance differs from the sheet's
  Calculator because the sheet's own bugs are gone: the Example rows are no longer counted, and the
  missing "Split Cost" cells on Khiem's sheet are included.
