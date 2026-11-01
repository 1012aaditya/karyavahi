#!/usr/bin/env bash
# Temporary narration: synthesises each script block with macOS `say -v Rishi` (Indian English),
# phrase by phrase, so the captions know exactly when each phrase is spoken.
#   public/audio/temp/01.aiff … 07.aiff   (raw synthesis, kept for reference)
#   public/audio/temp/01.wav  … 07.wav    (what the video plays)
#   public/audio/temp/timings.json        (phrase start/end times inside each block)
# Then it runs prepare-audio, which picks your own recordings over these when they exist.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/parse-script.cjs
node scripts/temp-voice.cjs
node scripts/prepare-audio.cjs
