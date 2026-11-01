# Footage

Recorded from the live site (https://karyavahi.onrender.com) by `node scripts/record.cjs` on
1 Nov 2026, with headless Google Chrome driven by the app's own `playwright-core`. Each clip is
Chrome's screencast (JPEG q92) assembled by ffmpeg into constant-30 fps H.264 (CRF 16).
Desktop clips are 1920×1080 (device scale 1); phone clips are 390×844 CSS px at device scale 2
(780×1688). The drawn cursor / tap ring is injected by the recorder.

| Clip | Beat (script block) | Signed in as | Page | Length |
|---|---|---|---|---|
| `home.mp4` | 03 command centre: map, "Needs you now" | BEO, Rampur Sadar | `/overview` | 13.0 s |
| `cmdk.mp4` | 03 ⌘K search, "Ask Claude" row, jump to CASE-0184 | BEO | `/overview` → `/cases/CASE-0184` | 15.0 s |
| `case.mp4` | 03 the drop, driver schools, conditions | BEO | `/cases/CASE-0184` | 15.6 s |
| `explain.mp4` | 03 "Explain this finding" (Claude) + "figures checked against the records" | BEO | `/cases/CASE-0184` | 17.4 s |
| `plan.mp4` | 03 "Suggest a plan" → "Open the plan composer with INT-01" → composer | BEO, Sundarpur (`beo.blk-17`) | `/cases/CASE-0127` → `/cases/CASE-0127/plan` | 21.0 s |
| `approve.mp4` | 03 one-tap approval by the DEO (maker–checker) | DEO, Rampur | `/approvals` → `/cases/CASE-0208` | 8.5 s |
| `work.mp4` | 03 tasks with owners and due dates | BEO | `/cases/CASE-0070` (Work) | 7.4 s |
| `myday.mp4` | 04 My day in Hindi, "मेरा दिन सुनें" speaking state | Headmaster Shalini Sonkar (USR-00206), Hindi | `/today` | 8.0 s |
| `dictate.mp4` | 04 "बोलकर लिखें": a note dictated into the proof form | same | `/today` | 8.8 s |
| `offline.mp4` | 04 proof handed in with no signal → "भेजने की प्रतीक्षा में" → signal back → sent | same | `/today` | 12.1 s |
| `sent.mp4` | 04 the proof on the task page with "GPS: विद्यालय पर" | same | `/tasks/TSK-00890` | 6.5 s |
| `evidence.mp4` | 05 proof queue: checked by someone else (hover only, nothing accepted) | BEO | `/evidence` | 8.3 s |
| `outcome.mp4` | 05 "Did it work?": DiD +20.0 pp, confirmed | BEO | `/cases/CASE-0074` | 7.5 s |
| `reopen.mp4` | 05 reopened cases ("reopened ×1") | BEO | `/cases?tab=reopened` | 7.3 s |
| `report.mp4` | 05 Action Taken Report + "Write the narrative" (Claude) | BEO | `/reports/RPT-00014` | 10.8 s |
| `sources.mp4` | sources page (recorded, not used in the cut) | BEO | `/sources` | 6.5 s |
| `roadmap.mp4` | roadmap page (recorded, not used in the cut) | BEO | `/roadmap` | 6.2 s |
| `whatsapp.mp4` | **not yet provided** — your phone recording for block 04 | — | WhatsApp | — |

Notes, honestly stated:

- **Map**: Google Maps' daily quota was used up on the day, so the home page shows the app's own
  plain map (with its notice "Google Maps refused the API key…"). A label in the video sits over
  that notice. Re-record `home` on a day the quota is fresh to get the Google map.
- **Claude drafts**: 6 fresh drafts were made in total (explain ×2, suggest plan ×2, narrative ×2;
  the second of each because the server's cache was refreshed between takes). Re-recording now
  replays the server's cached draft for the click and makes no new model call, unless the cache
  is empty (the script then says so).
- **Phone voice**: headless Chrome has no speech engine or microphone. The recorder replaces the
  browser's speech synthesis (so the Listen button shows its real "रोकें" speaking state) and the
  browser's speech recognition (it "hears" one scripted Hindi sentence). The app's buttons, states
  and form are real.
- **Offline**: real Playwright offline mode; the GPS fix is set to School 0002's position, and the
  server judged it "at the school". This handed in one real piece of proof on TSK-00890 and the
  DEO approved one plan (CASE-0208) — normal demo use; the demo resets nightly.

Re-record everything: `node scripts/record.cjs`. One beat: `node scripts/record.cjs plan`
(`proof` records `dictate`, `offline` and `sent` together). Raw frames go to `raw/` (git-ignored).
