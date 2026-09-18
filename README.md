# PPSplitMeDaddy

A subscription-free bill splitter for one household, hosted for $0 on Vercel + Turso. It replaces
`1008 Ravenscourt Bills.xlsx`.

- Expenses split equally, by shares, or by exact amounts. Refunds are entered as negative expenses.
- Payments are ledger entries, so partial payments work.
- Live balances, plus a settle-up that needs at most n−1 transfers.
- Monthly recurring bills (fixed or variable amount), and a one-time import from the spreadsheet.

Stack: SvelteKit 2 + Svelte 5, TypeScript, Tailwind v4, libSQL/Turso (SQLite) + Drizzle, Node 24.
See `CONVENTIONS.md` for code rules.

## Run locally

```sh
npm install
npm run dev            # http://localhost:5173 -> first visit opens /setup
npm test               # unit tests
npm run check          # type check
```

Locally the app uses a SQLite file at `data/app.db` and applies migrations on the first request, so no
Turso account is needed.

On first run, `/setup` creates you as the admin (in production it 404s unless opened as
`/setup?token=$SETUP_TOKEN`) and adds your roommates, who don't have logins yet.
To give a roommate a login, go to **Members → Invite link** and send them the link.
Admins can import the spreadsheet at **Import**.

Schema changes: edit `src/lib/server/db/schema.ts`, then `npm run db:generate -- --name <name>`.

## Configuration (env)

| Variable              | Default            | Notes                                                                         |
| --------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `DATABASE_URL`        | `file:data/app.db` | `libsql://<db>-<org>.turso.io` in production                                  |
| `DATABASE_AUTH_TOKEN` | —                  | Turso database token (`turso db tokens create <db>`)                          |
| `SETUP_TOKEN`         | —                  | **required in production** for first-run setup: open `/setup?token=<value>`   |
| `CRON_SECRET`         | —                  | **required in production**; Vercel sends it to `/api/cron` (16+ random chars) |
| `APP_TZ`              | runtime local time | e.g. `America/Los_Angeles`; recurring bills and "today" use this zone         |
| `COOKIE_SECURE`       | `true` in prod     | set `false` only if serving over plain HTTP                                   |
| `MIGRATIONS_DIR`      | `drizzle`          | local/dev only                                                                |

## Deploy (Vercel Hobby + Turso free, $0/mo)

1. **Database.** Install the [Turso CLI](https://docs.turso.tech/cli/introduction), then:
   ```sh
   turso auth login
   turso db create ppsplitmedaddy --location aws-us-east-1   # same area as Vercel's default iad1
   turso db show ppsplitmedaddy --url                        # -> DATABASE_URL
   turso db tokens create ppsplitmedaddy                     # -> DATABASE_AUTH_TOKEN
   ```
2. **Vercel.** Push the repo to GitHub and import it at vercel.com/new (framework: SvelteKit). Before the
   first deploy, add the environment variables `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SETUP_TOKEN`,
   `CRON_SECRET` and `APP_TZ`.
3. **Deploy.** `vercel.json` makes the build run `npm run db:migrate` against Turso first, then
   `vite build`. Preview deployments use the same database, so migrations apply as soon as a branch
   builds.
4. **Set up.** Open `https://<project>.vercel.app/setup?token=<SETUP_TOKEN>`, then import the
   spreadsheet and send invite links.

Vercel Cron calls `/api/cron` once a day (14:00 UTC, within the hour on Hobby) to create due recurring
bills and purge expired sessions. That daily query also stops Turso from archiving the database, which it
does after 10 idle days on the free plan. `GET /healthz` returns 200 for uptime monitors.

### Backups

There is no automated backup. Turso's point-in-time restore on the free plan covers the last day; for
anything older, dump by hand with `turso db shell <db> .dump > backup.sql`.

## Notes

- Importing the spreadsheet uses its **Bills** sheets only. The imported balance differs from the sheet's
  Calculator because the sheet's own bugs are gone: the Example rows are no longer counted, and the
  missing "Split Cost" cells on Khiem's sheet are included.
