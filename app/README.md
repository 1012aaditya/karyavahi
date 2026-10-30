# Karyavahi — the application

**DEMO MODE — FICTIONAL SEED DATA — NOT ACTUAL GOVERNMENT STATISTICS.** Every school, person,
score, cost and outcome in this app is generated. Nothing is connected to UDISE+, NAS, PRS,
ASER, a state VSK, WhatsApp or IVR.

This is the Next.js app that sits on top of the seed in the parent directory. The seed supplies
the data, the domain rules and the Postgres schema; this app is the interface an officer
actually works in.

## Run it

```bash
npm install
npm run db:build     # loads ../out/csv into a local SQLite copy (~6 s, 295,005 rows)
npm run dev          # http://localhost:3000
```

Then sign in as `beo.blk-01@demo.karyavahi.test` — no password; every account is fictional.

```bash
npm run verify       # typecheck, read-layer scoping, write-layer rules, the audit chain
npm run verify:full  # the above, plus a build, a crawl of every route, and the UI walkthrough
```

## The redesign (v2) — what was added

The product is organised into eight sections, each a real, data-backed workspace:

| Section | Route | What it does |
|---|---|---|
| Overview | `/overview` | "What needs my attention today": KPIs that link to filtered views, ranked priority actions, hotspot preview, trends, AI briefing, readable activity feed. Demo controls moved out. |
| Learning hotspots | `/hotspots` | Schematic tile map (no coordinates exist in the seed — labelled as such) with district → block → cluster → school drill-down, class/subject/competency/round filters, map/list toggle, detail panel. Severity in `src/lib/hotspots.ts` uses the detector's method (change vs district + two-proportion z, sample-size gate, "insufficient data" never shown as stable). |
| Cases & action plans | `/cases`, `/cases/[id]` | Tabbed ledger (open, critical, pending approval, overdue, awaiting verification, reopened, closed). The case page is a workspace: lifecycle stepper, section nav, next legal moves, rule-based intervention options, similar past cases, blockers. |
| Intervention studio | `/interventions`, `/interventions/compare`, `/interventions/[id]` | Case-ranked matching with every point explained (`src/lib/studio.ts`), side-by-side comparison with no composite score, what-if delivery-feasibility planner (budget, staff, weeks, attendance, training, connectivity) that never predicts an outcome. |
| Field execution | `/execution` | Overdue, due-soon, awaiting proof check, blockers (structured, escalate/resolve, audited), workload by officer with plain flags. Blockers are reported from any task page. |
| Impact & reports | `/impact`, `/reports`, `/reports/new` | Outcome verification workspace (DiD with interval, participation, delivery, closure eligibility). Report builder with 8 report types built from the ledger, preview, saved snapshots, Excel (.xlsx), CSV and print/save-as-PDF exports. |
| Karyavahi AI | `/assistant` + drawer on every page | Live Claude model through controlled, scope-checked tools (`src/lib/ai/tools.ts`), streaming, citations, flagged unretrieved ids, follow-ups, page context. The original computed "instant answers" remain alongside. |
| Administration | `/admin` | Hub for audit, imports, AI activity, roles & permissions, settings, jobs, outbox and `/admin/demo` (clock, sweep, reset). |

Also: public landing page (`/`), email sign-in (`/login`, honestly passwordless), demo personas (`/demo`), global scoped search (`/search`).

### AI configuration

Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` (server-side only). Model defaults to
`claude-opus-5-5` (`KARYAVAHI_AI_MODEL`), effort `medium` (`KARYAVAHI_AI_EFFORT`). Server-side refusal
fallback is on (`KARYAVAHI_AI_FALLBACKS=off` to disable). Without a key the AI panels say "not connected";
nothing pretends to be a model. Every interaction is logged to `ai_interactions` (model, tools, cited ids,
token counts, status — and only a short excerpt of the question). The model has **no write tools**: it
cannot approve, assign, verify, close or reopen.

### New tests

```bash
node scripts/e2e-v2.cjs        # 28 UI/HTTP acceptance checks on the redesigned app (system Chrome)
node scripts/e2e-v2.cjs --ai   # + live model checks: tool use, citations, out-of-scope refusal
node scripts/shots.cjs <email> <dir> /overview v:/hotspots m:/overview   # screenshots
```

The blockers table is created by the app in its SQLite copy (`src/lib/blockers.ts`) and back-filled from
reasons the seed already records (deadline changes, reassignments), each marked `derived_from_seed`.

## What it is

A case ledger. A learning drop is detected from assessment data, diagnosed against context,
planned, assigned, delivered, verified with proof, and closed **only** when the next assessment
round shows the gain the plan was built to produce. Each case page is laid out as the seven
questions an officer asks, in order:

1. **The finding** — what the two rounds show, the drop relative to the district, the z-test,
   the driver schools, and every data-quality gate with its value and threshold.
2. **What the data shows** — conditions observed in the driver schools, each traceable to the
   source rows it came from, ranked by how many schools share it, and labelled **association,
   not cause**. The AI hypothesis sits beside the officer's own conclusion, never instead of it.
3. **The plan** — the intervention, its evidence (or its explicit absence of an effect claim),
   its illustrative cost, the conditions under which it will not work, and the
   **pre-registration**: the comparison schools and success threshold locked at approval.
4. **The work** — who owes what, by when, and what proof each task must produce.
5. **The proof** — who submitted it and who checked it. Nobody verifies their own work.
6. **Did it work?** — the pre-registered difference-in-differences check with its 95% interval,
   the participation floor, and the closure blockers when it is not eligible.
7. **Timeline and audit** — every step, and every refused attempt.

## The parts

```
src/lib/
  db.ts          SQLite adapter. Column names match sql/schema.sql, so queries port to Postgres.
  scope.ts       Row-level security, ported. Every scoped read composes a predicate from here.
  session.ts     Who is signed in. Authority comes from their role rows, never from the cookie.
  guard.ts       Permission checks against src/domain/permissions.ts.
  write.ts       Every write. The TypeScript twin of the SECURITY DEFINER functions in SQL.
  actions.ts     Server actions. Thin wrappers that turn a refusal into a message on the page.
  clock.ts       The demo clock. Everything date-dependent reads this, not the wall clock.
  repo.ts        Reference data, geography, schools, trends.
  cases.ts       The case ledger: findings, diagnoses, plans, approvals, tasks, evidence, outcomes.
  dash.ts        Dashboard rollups.
  feed.ts        Notifications, reports, the audit chain, the AI log, the outbox, imports, jobs.
  assistant.ts   Questions answered from the database, with the record ids behind each answer.
  viz.ts         Chart colour tokens (kept out of the client module — see the note in the file).

src/components/  ui · labels · charts · lists · dash · case-panels · Shell · ActionForm
src/app/         the routes, one directory per page
scripts/         build-db · smoke · write-test · crawl · e2e · restart · verify
```

Nothing is duplicated from the seed. `src/domain/*` and `src/lib/*` in the parent directory are
imported directly, so the detector, the outcome check, the lifecycle table and the permission
matrix are literally the same code the generator and the validator run.

## How authority works

Three layers, in this order, on every write:

1. **Scope** — `scope.ts` ports each RLS policy in `sql/schema.sql` to a SQL predicate. A BEO
   sees 14 cases, a CRC 2, a headmaster one school and no staff-movement rows — the same numbers
   Postgres produces, asserted in `scripts/smoke.ts`.
2. **Role** — the matrix in `src/domain/permissions.ts`. The navigation is built from it, so a
   role never sees a link to something it would be refused.
3. **The rule itself** — `canTransition`, `reasonRequired`, `closureEligibility` from
   `src/domain/lifecycle.ts`, plus the specific guards: only a BEO or DEO closes a case, only
   on an eligible outcome; nobody verifies evidence they submitted; a block-lever plan is
   decided by a BEO or DEO and a district or PAB plan by a DEO or the state team.

A refusal is shown, with its reason, next to the button that caused it. Illegal transitions and
self-verification attempts are written to the audit chain as failures **before** the exception
is raised, outside the transaction, so the attempt survives the rollback.

## The audit chain

Append-only, SHA-256 hash-chained, using the same `ts-json-v1` scheme as the seed generator:
each row hashes its own fields plus the previous row's hash. The auditor page checks two
different things, because they catch different tampering:

- **Linkage** — each `prev_hash` matches the previous `hash`. Catches an inserted or deleted row.
- **Content** — each row's hash is recomputed from its fields. Catches an *edited* row, which
  linkage alone would miss if the editor also fixed up the neighbour.

All 47,061 seeded rows re-hash and match. `scripts/write-test.mts` edits a row in place and
asserts the content check fails while the links still join up — which is the whole reason the
second check exists.

## The demo clock

The seed stops at **24 Oct 2026**, so the case statuses are a true snapshot of that moment.
Reading "today" from the system clock would make the demo drift — tasks would silently go
overdue and escalation counts would climb on their own. Everything date-dependent reads
`clock.ts` instead. The demo administrator can move it from `/admin`.

To reach the November round: move the clock to 20 Nov 2026, then import
`samples/assessment_R4_midline_BLK-01_SIMULATED.csv`. **Uploading is not wired up in this
build** — the import pages show the seeded batches and their real rejected rows, and say so
plainly rather than faking an upload.

## Honesty, as a feature

The product only works if its claims can be trusted, so the labels are first-class components,
not footnotes:

| Label | Means |
|---|---|
| **Fictional demo data** | the row's provenance is `synthetic_demo` |
| **AI-drafted** | produced from a template, with the model named; it carries no authority |
| **Illustrative figure** | a plausible cost for the demo, never a PAB unit cost |
| **Association, not cause** | a condition observed alongside the drop, nothing more |
| **Simulated — not sent** | a WhatsApp/IVR/SMS message that was never delivered |
| **Cites a source — verify before production** | quotes published evidence that still needs checking |
| **No effect-size claim** | the honest position for 15 of the 18 intervention cards |

The outcome panel prints the parallel-trends caveat and the regression-to-the-mean warning
beside every estimate, and the effect chart shows an interval crossing zero as crossing zero.
"Improved — indicative" and "improved — confirmed" are different claims and are never merged.

## Charts

Inline SVG, no chart library. Categorical slots 1–3 of a validated palette (blue / orange /
aqua), assigned by entity and never by rank, so filtering a series never repaints the others.
Validated with `--pairs all` against this app's white surface: CVD ΔE 9.2, normal-vision ΔE
24.0. Aqua is below 3:1 contrast on white, so every chart also carries direct labels and a
table view. One y-axis, always; two measures of different scale get two charts.

## Language

English and Hindi throughout, switchable from the header. The seed already carries Hindi for
everything a field user reads — competency names, task titles, case statuses — so the app picks
the column rather than translating. Chrome with no Hindi in the data is translated in
`src/lib/i18n.ts`. A user's `preferred_language` is the default; the BEO demo account prefers
Hindi, which is why that account opens in Devanagari.

## Known limits

- **Uploading a file is not implemented.** The wizard's validation behaviour is visible through
  the seeded batches and their rejected rows; the upload itself is deliberately not faked.
- **No real language model.** The assistant answers from the database and says so. Generated
  text would have to be grounded the same way: answer only from cited rows, refuse to state a
  figure not in one, and log every draft.
- **SQLite, not Postgres.** Column names match `sql/schema.sql` exactly and scoping is ported
  predicate for predicate, but the database does not enforce RLS itself — the app does. Against
  Supabase, `sign-in` becomes `signInWithPassword`, `scope.ts` becomes redundant because the
  policies take over, and `write.ts` calls `transition_case()` and `verify_evidence()` instead
  of reimplementing them.
- **Demo sign-in has no password**, because there is nothing real to protect. Authority still
  comes from the role rows, so a signed-in BEO cannot read another block whatever the cookie says.
- Do not replace `.data/karyavahi.db` while the server is running. It is held open in WAL mode,
  and the running process will checkpoint its own pages back over the copy. `scripts/restart.sh
  --reset` does it in the right order.
