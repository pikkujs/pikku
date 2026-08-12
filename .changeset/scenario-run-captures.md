---
'@pikku/playwright': patch
'@pikku/cli': patch
---

Capture screenshots and video from a scenario run.

`pikku scenario run` gains `--screenshots` and `--video`, so a run can produce
something a person looks at rather than only a pass or a fail.

Screenshots are taken explicitly — `browser.screenshot('description')` — rather
than automatically after every step. Only the scenario author knows which
moments are worth a picture, and "after each step" captures the moment a step
finished instead of the moment that mattered. The description becomes the
filename, and every capture is stamped with the run and scenario that produced
it under `.pikku/scenario-runs/<runId>/<scenario>/`. With the flag off, the same
call returns the bytes and writes nothing, so a scenario that takes pictures
still runs.

Video records per browser context, which yields one video per scenario because
contexts are already closed between them. ffmpeg re-encodes the result when it
is on PATH — this footage is a near-static page, so it compresses hard — and the
run warns and keeps the raw recordings when it is not.

`ActorSession.screenshot()` previously passed its argument to Playwright as a
file path, so a name without an extension failed with
`unsupported mime type "null"`. It now takes a description and the SDK owns the
filename; callers that own the path use `writeScreenshot(file)`.
