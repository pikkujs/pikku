---
'@pikku/playwright': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Scenario runs now record video by default and keep the footage that is worth watching.

Playwright decides recording when a window opens, which is before anyone knows
whether the scenario passed — so `--video failed` (the new default) records every
scenario and discards the passes. `--video all` keeps everything, `--video off`
records nothing. Recording costs ~0.1-0.5s per actor context, nearly all of it
finalising the file on close; only kept videos are encoded, so a green run pays
no encoding at all.

Kept recordings are filed under `<run>/<scenario>/<actor>` alongside that
scenario's screenshots, rather than landing in one flat folder under
Playwright's own generated filenames.

Encoding is now h264/mp4 rather than VP9/webm: measured on scenario footage it
runs ~11x faster and lands ~30% smaller, and mp4 plays in every browser.

`--screenshots` is unchanged and still opt-in.
