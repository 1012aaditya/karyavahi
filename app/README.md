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

### v3 — geography, hierarchy, grievances, onboarding

| Area | Where | Notes |
|---|---|---|
| Interactive map | `src/components/GeoMap.tsx`, `src/lib/geo.ts`, `/api/geo/map` | MapLibre GL JS, **no third-party tiles** (no keys, works offline). Seven layers: learning gaps, critical cases, open complaints, overdue actions, intervention delivery, verified improvement, insufficient data (hatched on every layer). Labels carry the value as text. Opens at the user's own scope; drill-down, breadcrumbs, back, search, Blocks/Cities hierarchy toggle, reset view. |
| Geography model | `src/lib/ext/schema.ts`, `src/lib/ext/geogen.ts` | `geo_units`, `geo_relationships`, `geo_hierarchies`, `geo_levels`. Two hierarchies (administrative; urban, where a city ≠ a district). All shapes are **illustrative** — the state is fictional — generated as nested hex-grid partitions at 0°,0°. India's outline is deliberately not drawn (open datasets show borders that differ from India's official map). Load a licensed GeoJSON with `geometry_source='verified'` to replace them. |
| Central permissions | `src/lib/authz.ts` | `authorize(session, permission, resource)` checks account status → role grant (built on the domain matrix) → geographic scope → ownership → organisational seniority → confidentiality. |
| Hierarchy | `src/lib/org.ts`, `/admin/hierarchy` | `reporting_lines` (designated authority, derived from the seed), `delegations` (time-boxed acting charge, applied in the session and lapsing automatically), audited manager/scope/status changes. |
| Complaints | `src/lib/complaints.ts`, `/complaints` | Separate from cases (linkable). Routed to the reporter's designated authority unless a category/priority policy says otherwise; conflict-of-interest routing around an accused officer; 14-state workflow with actor checks; SLA escalation sweep (idempotent) and manual escalation with reason; restricted complaints visible only to the route and the state auditor. |
| Onboarding | `src/lib/onboarding.ts`, `/register`, `/admin/accounts` | Request → email code (shown on screen in demo) → simulated affiliation check → designated verifier approves/rejects/asks/reassigns. No self-approval, no approving equal or senior roles, duplicate detection, change requests, suspension/reactivation with history. |
| Tests | `scripts/security-test.mts` | 73 checks: scope at every level, delegation and its lapse, map scope and probing, routing, workflow, SLA, confidentiality, onboarding, suspension, self-protection — on a scratch copy of the seed. |

All new tables are created by the app beside the seed's (never altering seed tables) and re-created automatically after a demo reset.

### v4 — round import with a live detection run, and case discussion threads

| Area | Where | Notes |
|---|---|---|
| Round import | `/import`, `src/components/RoundImport.tsx`, `src/lib/write-import.ts`, `src/lib/import-csv.ts` | Upload a CSV of `assessment_results` rows → **Check the file** (preview; nothing saved) → **Commit** → detection runs. Rows are refused with the seed's own codes (`missing_required`, `non_numeric`, `unknown_school_id`, `invalid_date`, `proficient_exceeds_assessed`, `duplicate_row`) and stored with the batch. Only roles holding `data.import` (BEO, DEO, state team, demo admin) may import; refusals are audited as `import.refused`. Each officer can import only schools in their own area — a BEO their block, a DEO their district. |
| Same file twice | `import_file_hashes` (ext table) | The file's sha256 (ignoring BOM and line endings) is remembered per round and area. A second commit of the same file adds nothing and is audited as `import.duplicate_ignored`; a different file with rows already on record has those rows refused as `duplicate_row`. |
| Live detection run | `runDetection()` in `src/lib/write-import.ts` | `src/domain/detect.ts` on the previous round against the new one, with the settings version in force on the demo date (`setting_versions`), exactly as the seed does. New hotspots become findings and **cases owned by the block's BEO**, scoped to the cluster, with a rule-based diagnosis (the seed's teacher-transfer / visit-gap / attendance / PTR rules) and a notification. A flagged drop where a case is already open is monitored on that case instead. Re-running adds only what is new. Until every block has reported, the "district change" is the change across the schools that have reported so far. |
| The demo clock | `roundIsOpen()` | A round can be imported once its assessment **window has opened** on the demo clock (results arrive school by school), and rows dated after "today" are refused as `invalid_date`. R4 opens 16 Nov 2026 and the seed's clock is 24 Oct, so the demo admin moves the clock to 20 Nov first — there is a button for it on `/import`. |
| R4 sample generator | `scripts/gen-r4.mts`, `samples/` | `npm run gen:r4` writes a realistic R4 CSV from the R3 rows: same cohorts, a small midline gain, binomial sampling, a treatment effect for schools whose plan is judged on R4, and a few planted cluster drops so detection has something to find. `-- --errors` adds one row of each mistake; `-- --scope DST-01` or `-- --scope all` for bigger files. `samples/R4_midline_BLK-01_with_errors.csv` and `samples/R4_midline_BLK-01.csv` are committed. |
| Case threads | `/cases/[id]` → **Discussion**, `src/components/CaseThread.tsx`, `CaseThreadComposer.tsx`, `src/lib/threads.ts`, `src/lib/write-threads.ts` | Post and edit your own comments (edits are version-checked; the old text stays in the audit chain). Type `@` to mention someone — the picker offers **only people who can open the case**, and the server refuses (and audits) a comment that mentions anyone else, so nobody is notified about a case they cannot see. Follow / unfollow; the case owner follows by default. Mentioned people and followers are notified; followers are re-checked against scope every time. A BEO, DEO or state officer can flag a comment as a **decision**: it also writes a `decision_recorded` case event and cannot be edited afterwards. |
| Tables | `src/lib/ext/collab-schema.ts` | `import_file_hashes`, `case_comments`, `case_comment_mentions`, `case_watchers` — created beside the seed's tables, each feature with its own version marker in `ext_meta` (`round_import_version`, `threads_version`). |
| Tests | `scripts/import-test.mts`, `scripts/threads-test.mts`, `scripts/e2e-import-threads.cjs` | `npm run test:import` (57 checks: validation, clock, roles, scope, preview writes nothing, the same file twice, detection opens the planted hotspots as cases, audit chain). `npm run test:threads` (51 checks: picker, mentions in and out of scope, followers, edits, stale edits, decisions, audit chain). Both run on a scratch copy — stop the server first. `KV_BASE=http://localhost:3000 node scripts/e2e-import-threads.cjs` drives both features in Chrome (mutates the DB; reset afterwards). |

#### Try it

1. Sign in as `admin@demo.karyavahi.test`, open **Administration → Data import**, press **Move the demo clock to 20 Nov 2026**.
2. Sign in as `beo.blk-01@demo.karyavahi.test` (switch to English from the account menu if you like), open **Data import**.
3. **Choose file** → `app/samples/R4_midline_BLK-01_with_errors.csv` → **Check the file**. The preview shows 2,340 good rows and 9 refused, grouped by reason.
4. **Commit 2,340 rows and run detection**. The result lists the batch (IMP-0042) and the new cases detection opened — CASE-0216 (Class 1 number recognition, Sonagaon cluster) and CASE-0217 (Class 2 word reading, Kusumgarh cluster).
5. Choose the same file again and check it: "Already imported", and the commit button stays off.
6. Open CASE-0216, scroll to **Discussion**. Type `@Sim` and pick Simran Shukla (the DEO), post. Tick **Record this as a decision** on a second comment — it appears in the timeline too. Use **Edit** on your first comment, and **Unfollow / Follow**.
7. Sign in as `deo.rmp@demo.karyavahi.test` → the bell / **Notifications** shows "Vikas Qureshi mentioned you on CASE-0216".
8. Reset afterwards with `npm run db:init -- --force` (server stopped) or the demo admin's reset.

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

To reach the November round: move the clock to 20 Nov 2026 (the button on `/import` or the
admin page), then import `app/samples/R4_midline_BLK-01_with_errors.csv` on `/import`. A round can
be imported once its assessment window has opened on the demo clock, and rows dated after the
demo date are refused. (The seed's own `samples/assessment_R4_midline_*_SIMULATED.csv` files
record almost every child as not proficient, so they would flood the detector; use
`npm run gen:r4` instead.)

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

- **Only assessment rounds can be uploaded.** Attendance and staff-movement batches are still
  the seeded ones. A committed batch cannot be withdrawn from the UI; a correction is a new
  upload (rows already on record are refused as duplicates).
- **Outcome checks are not re-run automatically when a round arrives.** The cases whose plan
  is judged on R4 still need an evaluation run against it (`recomputeOutcome(..., { followupRoundId:
  'RND-2026-11' })` in `write.ts`); the case page does not yet offer that as a button.
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
