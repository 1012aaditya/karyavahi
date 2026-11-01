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
npm run verify       # typecheck, read-layer scoping, write-layer rules, the audit chain, sessions
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
  plans.ts       The Plan Composer and the task generator, read side: candidate schools, the
                 pre-registration (comparison schools and threshold), the task list and owners.
  dash.ts        Dashboard rollups.
  feed.ts        Notifications, reports, the audit chain, the AI log, the outbox, imports, jobs.
  assistant.ts   Questions answered from the database, with the record ids behind each answer.
  viz.ts         Chart colour tokens (kept out of the client module — see the note in the file).

src/components/  ui · labels · charts · lists · dash · case-panels · Shell · ActionForm
src/app/         the routes, one directory per page; signed-in pages sit in the (app) group,
                 whose layout redirects to /login before anything is streamed
scripts/         build-db · smoke · write-test · crawl · e2e · restart · verify
```

Nothing is duplicated from the seed. `src/domain/*` and `src/lib/*` in the parent directory are
imported directly, so the detector, the outcome check, the lifecycle table and the permission
matrix are literally the same code the generator and the validator run.

## How authority works

Three layers, in this order, on every write:

1. **Scope** — `scope.ts` ports each RLS policy in `sql/schema.sql` to a SQL predicate. A BEO
   sees 14 cases, a CRC 2, a headmaster one school and no staff-movement rows — the same numbers
   Postgres produces, asserted in `scripts/smoke.ts`. Only the state team, the demo admin and the
   state auditor read state-wide; a district auditor reads their district. Import batches are
   shown where their area overlaps yours, and their rejected rows only for schools in your area
   (`importBatchPred`, `rejectedRowPred`); `npm run test:scope` checks these.
2. **Role** — the matrix in `src/domain/permissions.ts`. The navigation is built from it, so a
   role never sees a link to something it would be refused. Every case move also has its own
   list of roles (`TRANSITION_ROLES` in `src/domain/lifecycle.ts`; a move not listed is refused
   for everyone), and the role that holds the move must itself cover the case's area
   (`moveRefusal` in `src/lib/guard.ts`). Seeing a case — as a headmaster whose school is in it,
   a task owner or an auditor — gives no authority to move it.
3. **The rule itself** — `canTransition`, `reasonRequired`, `closureEligibility` from
   `src/domain/lifecycle.ts`, plus the specific guards: only a BEO or DEO closes a case, only
   on an eligible outcome; nobody verifies evidence they submitted; nobody approves a plan they
   submitted (they may still send it back); a block-lever plan is decided by a BEO or DEO and a
   district or PAB plan by a DEO or the state team. The reminder sweep and the demo clock are the
   demo admin's alone. `npm run test:authority` checks all of this.

## Composing a plan and assigning the work

A case being looked into, sent back or reopened gets its plan in the **Plan Composer**
(`/cases/[id]/plan`, from the case's Plan section). The officer picks an intervention from the
ranked matches (`matchForCase` in `studio.ts`, every point explained), picks the schools, and
previews what the plan will say before anything is saved:

- **How success will be judged.** The follow-up round, the threshold from the settings in force,
  and the comparison schools: for each plan school, the two closest on the baseline result (and
  more lightly on enrolment) from other clusters in the district, not already in another open
  case. This is the rule the seed used for every historical plan (`preRegistrationFor`).
- **The work it will turn into** — one task per template, per school where the template says so.

Saving (`draftPlan` in `write.ts`) recomputes all of this with the same functions, so the stored
plan is exactly the preview. Each save is a new plan row; an unsubmitted earlier draft is marked
`superseded`. The case takes the intervention's lever, which decides who approves. "Save and
submit" also submits it; someone other than the submitter approves it, and approval locks the
terms. Older plans that never had them (the seeded AI drafts) get them when submitted, or at the
latest when approved, and never again after that.

An approved plan becomes work at `/cases/[id]/assign` (`assignTasks`). Each task's owner is
suggested from who covers it: the school's headmaster, the case's cluster coordinator (or another
in the block), the block resource coordinator with the fewest open tasks, the district officer.
The officer may change owners and due dates but not drop or add tasks, and the independent
spot-check must go to someone who is not delivering the work. Every owner is notified. A case can
no longer be moved to "Work assigned" without its tasks.

A task whose owner cannot do it (leave, transfer, another duty) is moved from its own page by
the block or district officer (`reassignTask`). The new owner must cover the task's school the
same way, the independent check stays independent, and a reason is required; it is kept on the
task with the previous owner, on the case timeline and in the audit chain, and both people are
notified. Started work goes back to "assigned" for the new owner to acknowledge. A task with proof
waiting to be checked, or already verified, stays where it is. `npm run test:plan` checks all of it.

A refusal is shown, with its reason, next to the button that caused it. Illegal transitions,
moves without authority, approvals of your own plan, hand-run sweeps and self-verification
attempts are written to the audit chain as failures **before** the exception
is raised, outside the transaction, so the attempt survives the rollback.

## The audit chain

Append-only, SHA-256 hash-chained, using the same `ts-json-v1` scheme as the seed generator:
each row hashes its own fields plus the previous row's hash. "Previous" means previous in the
chain's own order, `audit_events.seq`, not by timestamp, so moving the demo clock backwards
cannot reorder the chain; the auditor page walks every row in that order. The auditor page
checks two different things, because they catch different tampering:

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

## Design tokens

Every colour is defined once, in `src/lib/tokens.ts`: the palette, a dark variant for map and
evidence surfaces (`surface-dark` swaps the CSS variables, so classes inside need no change), one
severity ramp shared by hotspot chips, the map and the charts, and the chart series. Tailwind
reads the tokens (`tailwind.config.ts`), MapLibre reads the hex values. Text sizes come from one
scale (`text-2xs` 11px … `text-5xl` 52px); fonts are IBM Plex Sans with its matching Devanagari,
Plex Mono, and Source Serif 4 for page and case titles, served by `next/font`. Menus and drawers
are Radix primitives in `src/components/primitives/`, so they trap and return focus and work
from the keyboard. `src/app/{loading,error,not-found,global-error}.tsx` cover every route.

## Language

English and Hindi throughout, switchable from the header. The seed already carries Hindi for
everything a field user reads — competency names, task titles, case statuses — so the app picks
the column rather than translating. Chrome with no Hindi in the data is translated in
`src/lib/i18n.ts`. A user's `preferred_language` is the default; the BEO demo account prefers
Hindi, which is why that account opens in Devanagari.

The field workers' pages (`/today`, `/field`, `/school`, `/tasks` and a task) are fully Hindi,
including dates ("05 नव॰ 2026"), the sidebar and header, the map legend and the forms' own words.
`npm run test:hindi -- http://localhost:3000` loads them in Hindi as a coordinator, a block
coordinator and a headmaster and reports any English interface text. Data stored in English
(school and people's names, case and complaint titles, reasons officers typed) is allowed; it
is recognised by looking it up in the database. Officer pages are not yet fully translated.

## My day and photo proof

Cluster and block coordinators and headmasters land on **My day** (`/today`), built for a phone:
one column, large buttons, and a tab bar at the bottom (My day · School(s) · My tasks · Raise).
It lists the person's own work in the order to do it: proof sent back (with the reason), late,
due today, this week, later, and proof already handed in. Each task can be marked seen, started
and given its proof on the same screen. Coordinators also see the schools in their area that have
gone longest without a visit, and everyone sees complaints waiting on them. The desktop Field
Operations workspace (`/field`) and the headmaster's school page (`/school`) are still in the menu.

Proof can carry a photo. The browser shrinks it (longest side 1600 px) before sending, but the
server trusts nothing it is told: it reads the first bytes to decide whether it is a JPEG, PNG or
WebP, refuses anything else or anything over 5 MB, computes the SHA-256 itself, refuses a photo
already used as proof elsewhere, and stores it in `.data/evidence-files/` under that hash
(`src/lib/evidence-files.ts`, table `evidence_files`). The evidence row's hash is the photo's.
`/api/evidence/[id]/photo` serves it only to someone who can see that proof, and hashes it again
first, refusing a file that has changed on disk. `npm run test:myday` checks all of this.

## The hotspot map: real Uttar Pradesh, simulated data

The map shows the real state of Uttar Pradesh. `data/up-geo.json` holds the state outline, its
75 districts and three city centres from OpenStreetMap (© OpenStreetMap contributors, ODbL),
simplified to about 0.5 MB; `npm run geo:fetch` rebuilds it from the Overpass API. When the file
is present the database is set up with it (`seedRealGeography` in `src/lib/ext/schema.ts`):

- the demo's three districts become **Rampur, Lucknow and Varanasi**, with their real outlines;
- their blocks, clusters and school positions are **simulated**: drawn inside the real outline by
  dividing it into small cells (`generateInsideReal` in `src/lib/ext/geogen.ts`), never named
  after real sub-districts or schools;
- the other 72 districts are drawn with **no data** (faint, not zoomable);
- the three **cities** are circles around the real city centres, holding the simulated clusters
  inside them.

Every unit records where its shape came from (`geometry_source`: `osm`, `simulated`,
`approximate`), and the map, legend and side panel say so. All learning figures remain fictional.
Without the file the app falls back to the invented honeycomb state.

Who sees what is unchanged and decided on the server: the state team sees all 75 districts, a
district officer only their district, a block officer their block, a coordinator their cluster,
a headmaster their school. The state view colours each district by its worst block (a district
measured against itself would always read zero) and counts its hot clusters.

**Colour areas by** (Layers menu) switches between learning change and three measures of each
school's situation right now, from `src/lib/school-now.ts`: teacher shortage (posts unfilled, or a
teacher who left without a replacement), visit gaps (days since the last visit) and attendance
trend (last three months against the three before). A larger area takes the colour that half,
30% or 15% of its schools reach. Clicking a school shows a **Right now** card. Headmasters never
see staff movements, on the map or anywhere else.

**Google Maps.** With a browser key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (in `app/.env.local`,
which git ignores), the hotspot page draws on Google Maps, with roads, places and a satellite
view (`src/components/google-map-view.ts`). Google's free *Maps Demo Key* works for prototyping;
production needs a key with billing. Restrict the key to your site's address. Without a key, or
if Google refuses it, the same map is drawn without background tiles, and a note says why. The
small dashboard maps always use the plain map. `npm run test:map` checks the geography, the
access rules and the thresholds.

## Speed, and five loose ends closed (backend hardening)

**How fast.** `node scripts/perf.mjs http://localhost:3012` signs in as five roles (state lead,
district officer, block officer, cluster coordinator, headmaster) and times 74 pages and map
calls against a production build (`npx next build && npx next start -p 3012`), printing the
first hit and the median of three. `--json out.json` saves a run and `--compare out.json` prints
it beside a new one. Measured on this machine, production build, before → after:

| Page or call | Who | Before (median) | After (median) |
|---|---|---|---|
| `/api/geo/map` (the whole state) | state lead | 685 ms | 62 ms |
| `/api/geo/map?h=urban` | state lead | 698 ms | 64 ms |
| `/api/geo/map` (their district / block) | DEO / BEO | 226 / 218 ms | 19 / 12 ms |
| `/overview` | state / DEO / BEO | 266 / 402 / 170 ms | 24 / 19 / 14 ms |
| `/cases/CASE-0184` | DEO | 74 ms | 19 ms |
| slowest of all 74 | | 698 ms | 64 ms |
| first request after a demo reset (sets up the extra tables) | | ~2.2 s | ~0.95 s |

Every page was already under a second on a production build; the 13–54 s seen earlier was the
development server (`next dev` compiles each page on its first visit, and runs React in its slow
checking mode) on a busy machine. On `next dev` the same pages took 0.1–1.7 s once compiled.

What changed:

- **Learning sums are kept until the data changes** (`src/lib/learning-cache.ts`). The hotspot
  engine, the map and the learning trend add up ~150,000 assessment rows; the state map did it
  nine times per request. Each answer is now kept, keyed by its SQL and parameters (so a block
  officer never gets the state's answer), and dropped the moment `assessment_results` or `schools`
  change: a trigger bumps `learning_data_gen` in `ext_meta` on every insert, update or delete, so
  an imported round shows on the next request with no timer and no restart.
- **Indexes** through the extension schema, marked `perf-v1` in `ext_meta` (like `integrity-v1`):
  `user_roles (role, scope_id)`, `users lower(email)`, `tasks (school_id)`, `evidence (submitted_by)`.
  The seed already had the others the pages need (tasks by owner/case/plan, evidence by
  task/case, cases by geography, assessment results by school and round, visits, notifications,
  audit by entity). Deriving the reporting lines after a reset no longer asks "who is this
  cluster's CRC" 2,300 times.
- **Per-row queries folded into one**: My day's proof counts, send-back reasons and case titles
  (`myday.ts`); the open-task count beside every person the plan composer offers, which was also
  re-queried inside a sort (`plans.ts`). `school-now.ts` was already batched. The badge counts in
  the top bar cost under 2 ms in total, so they were left alone.

**Loose ends.** Each has a test.

- **Checking proof** (`src/lib/duty.ts`). Only the submitter was barred, so after a reassignment
  the previous owner could accept the new owner's proof, and a task's owner could accept proof
  someone else uploaded for it. Now nobody checks proof for a task they own, held before (from
  `tasks.reassigned_from` or the audit trail), or handed in any proof for. The same rule filters
  every "proof waiting on you" queue and badge, so the app never offers a check it would refuse.
  (`write-test`)
- **Registration code** (`src/lib/reg-code.ts`). The emailed-code stand-in travelled in the
  address (`/register/status?…&code=123456`), where history, logs and Referer headers keep it.
  It now sits in a 30-minute, http-only cookie for `/register` holding the request id and code,
  so only the browser that applied sees it. (`session-test` over HTTP)
- **Who may sign in** (`src/lib/sign-in.ts`). Any account could be signed into by address alone,
  including one registered with a real address. The rule: an active account with a role whose
  email is on `demo.karyavahi.test` (the `.test` domain is reserved and never delegated, so it
  cannot be anyone's mailbox). Not just the seven `is_demo_account` personas: the walkthroughs and
  the crawl sign in other fictional officers and headmasters. Registration accepts only demo
  addresses too, so an approved request can always sign in; a refused address gets the same
  answer as an unknown one, and is not echoed into the URL. (`security-test`, `session-test`)
- **Approvals' required role.** It disagreed with the case's lever for 35 of the 268 seeded approvals. Each
  one matched the lever of *its own* plan: a case's lever moves when a new plan is drafted or the
  case goes to the PAB. Approvals now record that lever (`approvals.lever`, migration
  `approvals-v1`), the role always comes from it through `requiredRoleFor()` in `guard.ts` (the
  same table the decision gate uses), and new approvals are written the same way. (`authority-test`)
- **AI executive briefing.** The permission matrix gives `ai.executive_briefing` to district and
  state officers only, but `/api/ai/briefing` checked `ai.assistant`, so a block officer could get
  one. The route and `lib/ai/briefing.ts` now ask `mayReadBriefing()`; a block officer's overview
  shows the computed summary (`overview.plainBrief`), which is what it shows today.
  (`authority-test`, `session-test`)

## Known limits

- **Only assessment rounds can be uploaded.** Attendance and staff-movement batches are still
  the seeded ones. A committed batch cannot be withdrawn from the UI; a correction is a new
  upload (rows already on record are refused as duplicates).
- **Outcome checks are not re-run automatically when a round arrives.** The cases whose plan
  is judged on R4 still need an evaluation run against it (`recomputeOutcome(..., { followupRoundId:
  'RND-2026-11' })` in `write.ts`); the case page does not yet offer that as a button.
- **My day has no offline queue yet.** A proof handed in without signal fails with a message and
  has to be sent again. The location on proof is still the worker's own statement, not GPS.
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
  The cookie is a random session token, not the user id: only its SHA-256 is kept in `sessions`,
  it lasts 12 hours, and signing out revokes it on the server. Sign-in, sign-out and the language
  switch refuse forms posted from another site (`src/lib/http.ts`); `npm run test:session` checks
  all of it, and `npm run test:session -- http://localhost:3000` adds the same checks over HTTP.
- Do not replace `.data/karyavahi.db` while the server is running. It is held open in WAL mode,
  and the running process will checkpoint its own pages back over the copy. `scripts/restart.sh
  --reset` does it in the right order.
