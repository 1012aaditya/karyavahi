# Karyavahi

A case ledger for school learning drops.

A drop is detected from assessment data, diagnosed against context, planned, assigned, delivered,
verified with proof, and closed **only** when the next assessment round shows the gain the plan was
built to produce. Not a dashboard: a dashboard tells you a number fell, this makes someone
accountable for it and refuses to let them mark it resolved on anything but evidence.

> **DEMO MODE — FICTIONAL SEED DATA — NOT ACTUAL GOVERNMENT STATISTICS.**
> Every school, person, score, cost and outcome is generated. Nothing is connected to UDISE+, NAS,
> ASER, a state VSK, WhatsApp or IVR. The seed holds 3 districts, 18 blocks, 140 clusters, 2,109
> schools and 2,313 users across 295,000 rows.

## Before you clone

You need **two** things, and the second one is easy to miss:

- **Node v22.5.0 or newer.** The data layer uses Node's built-in `node:sqlite`, which does not
  exist in older versions.
- **[Git LFS](https://git-lfs.com).** The 67 MB seed database is stored with LFS. Install it and
  run `git lfs install` *before* cloning.

Cloning without Git LFS leaves a 133-byte pointer where the database should be, and the failure is
quiet and misleading — `db:init` copies the pointer and reports success, then the app dies on it:

```
Ready: ...\app\.data\karyavahi.db       <- looks fine
SqliteError: file is not a database     <- it is not fine, and nothing mentions LFS
```

If you have already cloned that way, `git lfs install && git lfs pull` fixes it in place.

## Run it

```bash
git lfs install
git clone https://github.com/1012aaditya/karyavahi.git
cd karyavahi/app
npm install
npm run dev
```

Then open <http://localhost:3000>. If that port is busy, `npm run dev -- -p 3001`.

`npm run dev` creates the working database from the seed on first run, so there is no build step.

## Sign in

No passwords — every account is fictional. Start with the block officer, who has the freshest
queue:

```
beo.blk-01@demo.karyavahi.test
```

That account prefers Hindi, so the app opens in Devanagari; the **हिंदी / English** button in the
header switches it. The login page lists one account per role.

The most interesting path through the demo is in [START-HERE.md](START-HERE.md): open **CASE-0184**,
read the finding and then the diagnosis, approve the plan — which locks the comparison schools and
the success threshold *before* anyone knows the result — then sign in as the auditor and find your
own approval in the hash-chained audit trail.

For administration, sign in as `admin@demo.karyavahi.test` and look at `/settings` (thresholds are
versioned and editable, and old findings keep the version they were judged under) and `/users`.

## Layout

```
karyavahi/
  src/domain/     the rules: detection, outcome check, lifecycle, permissions
  src/lib/        seeded randomness, IST dates, t-values
  app/            the Next.js application   <- run npm commands in here
    .data/        the seed database (Git LFS)
```

`src/domain` is imported by the app directly rather than copied, so the detector and the outcome
check running in the interface are the same code that generated and validated the data.

## Commands

All of these run in `app/`.

| Command | What it does |
|---|---|
| `npm run dev` | development server on port 3000 |
| `npm run build` then `npm start` | production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run smoke` | read-layer scoping checks; safe while the server runs |
| `npm run test:write` | write-layer rules and the audit chain — **stop the dev server first** |
| `npm run db:init -- --force` | discard demo changes and start from the seed again |

`test:write` swaps the database file. The running server holds it open in WAL mode and will
checkpoint its own pages back over the copy, so stop the server before running it.

## Two things worth knowing

**The demo clock.** The seed stops at 24 October 2026, and everything date-dependent reads that,
not your system clock — otherwise tasks would silently go overdue and escalation counts would climb
on their own. The demo administrator can move it from `/admin`.

**Honesty is a feature here, not a footnote.** Generated text is labelled AI-drafted and carries no
authority; costs are marked illustrative; conditions found alongside a drop are labelled
*association, not cause*; confidence intervals that cross zero are shown crossing zero; and
"improved — indicative" and "improved — confirmed" are different claims that are never merged. The
front page shows how many cases were reopened because the work was delivered but the next round
showed no gain.

## Known limits

- **Uploading a file is not implemented.** The import pages show the seeded batches and their real
  rejected rows, and say so plainly rather than faking an upload.
- **No real language model.** The assistant answers from the database and cites the record ids
  behind each answer; the "AI" drafts are templates, labelled as AI anyway so the logging discipline
  around generated text is visible.
- **SQLite, not Postgres.** Column names match `sql/schema.sql` and row-level security is ported
  predicate for predicate in `app/src/lib/scope.ts`, but the database does not enforce it — the app
  does.

There is more detail in [app/README.md](app/README.md), including how this maps onto
Postgres/Supabase.

## Provenance

This project was distributed as a prebuilt package (`karyavahi-ready-to-run.zip`) and carries no
licence file, so it is not covered by any open-source terms. The first commit's message records what
this tree changes on top of that package.
