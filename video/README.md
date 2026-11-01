# Karyavahi — 3-minute demo video

The video is code: a [Remotion](https://www.remotion.dev) project (React components that are
rendered frame by frame into an MP4). Everything lives in this folder.

- **Output**: `out/karyavahi-demo-temp-voice.mp4` (1920×1080, 30 fps, H.264 + AAC, exactly 3:00),
  captions in `out/captions.srt`, review stills in `out/stills/`.
- **Script**: `script.md` — the 7 narration blocks and their time marks. The scenes, captions and
  temporary voice all follow it.

## Look at it while you work

```bash
cd video
npx remotion studio        # opens a browser preview with a timeline you can scrub
```

## Put in your own voice (the main thing left to do)

1. Record each block of `script.md` as its own clip (phone voice-memo app is fine), named
   `01.m4a`, `02.m4a`, … `07.m4a` (`.mp3` or `.wav` also work).
   *Or* record it all in one take and name it `full.m4a`; it then plays from 0:00 and the block
   files are ignored.
2. Copy them into `video/public/audio/user/`.
3. Re-render with one command:

```bash
cd video
npm run build              # → out/karyavahi-demo.mp4 (+ out/captions.srt)
```

`npm run build` re-reads `script.md`, picks your recordings over the temporary voice
(`scripts/prepare-audio.cjs` writes the choice to `src/generated/audio.json`), and renders.
Each block's clip starts at its time mark, so keep each one shorter than its block
(01: 20 s · 02: 12 s · 03: 43 s · 04: 35 s · 05: 20 s · 06: 25 s · 07: 25 s); the script warns
if one is too long. With your own clips the captions are spread over each clip in proportion to the
phrase lengths; with the temporary voice they are timed to each phrase exactly.

The temporary voice (macOS `say -v Rishi`) is in `public/audio/temp/` and is made by
`bash scripts/temp-voice.sh` (run it again if you change `script.md`).

## Put in your WhatsApp phone clip

Save your screen recording as **`video/public/footage/whatsapp.mp4`** and run `npm run build`.
It replaces the re-created chat in block 04 (1:36–1:50), fitted into the drawn phone and sped up
if it is longer than ~13 s (at most 3×). Until then the video shows a re-created chat labelled
"Chat re-created for the video". The code for that slot is `WhatsApp` / `SimulatedChat` in
`src/scenes/S04Field.tsx`. Tip: a portrait recording works best; trim dead time at the start first
(QuickTime → Edit → Trim).

## Scenes

| Block | Time | Scene file | What is on screen |
|---|---|---|---|
| 01 The challenge | 0:00–0:20 | `src/scenes/S01Challenge.tsx` | dashboard cell turns red, lifts out ("−18 pts"), "And then… nothing happens."; staircase UDISE+ → NAS·PRS → VSK → NIPUN apps → Alert, then the missing steps Owner · Deadline · Proof · Re-tested in grey |
| 02 Our answer | 0:20–0:32 | `S02Answer.tsx` | the case at the centre of the loop Flag → Diagnose → Plan → Approve → Act → Verify; closes only on a gain |
| 03 The officer's view | 0:32–1:15 | `S03Officer.tsx` | live footage in a browser frame: command centre, ⌘K / Ask Claude, the case, Claude explains (figures checked), Claude suggests a plan → composer with costs, one-tap DEO approval, tasks with owner + deadline |
| 04 Easy for the field | 1:15–1:50 | `S04Field.tsx` | phone in Hindi: My day, Listen, speak a note, offline → sent with GPS, WhatsApp slot |
| 05 Proof, then results | 1:50–2:10 | `S05Results.tsx` | proof queue (checked by someone else), DiD outcome, reopened cases, Action Taken Report + Claude narrative |
| 06 Why you can trust it | 2:10–2:35 | `S06Trust.tsx` | five layers (LLM only in L2), guardrail chips, real public data badges, 20 suites · 1,752 pages · 0 failures, every role |
| 07 Next, and close | 2:35–3:00 | `S07Close.tsx` | Now → pilot in one district → state-wide; logo, कार्यवाही, the tagline, URL, "Fictional demo data · not government statistics" |

Across 03 and 05 a strip at the top ticks off what scene 01 said was missing:
owner + deadline · proof checked by someone else · closes only on a measured gain · reopens if no gain.

Design: the app's own palette (navy ink, ivory, teal `#167D78`, crit red) and its two typefaces
(Source Serif 4 for titles, IBM Plex Sans + Plex Sans Devanagari), copied from the app's build into
`public/fonts/`. No text under 28 px outside the recorded screens. All moves use one ease-in-out
curve; scenes cross-fade.

## Footage

The product clips in `public/footage/` were recorded from the live site by `scripts/record.cjs`
(see `public/footage/README.md` for each clip, its page and its length, and what was simulated).

```bash
node scripts/record.cjs              # every beat (wakes the site first; takes ~6 minutes)
node scripts/record.cjs home cmdk    # only some beats
```

After re-recording, run `npm run build` (clip lengths are re-read). If a re-recorded beat changes
timing, adjust that segment's `trim`/`dur`/camera keys in the scene file; the camera keys are
`[seconds, x, y, zoom]` in the clip's own pixels.

## Other commands

```bash
npm run stills             # re-export the review stills to out/stills/
bash scripts/temp-voice.sh # rebuild the temporary voice after editing script.md
```

Remotion uses the installed Google Chrome (`remotion.config.ts`), so it does not download its own.
