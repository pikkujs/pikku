---
'@pikku/core': patch
'@pikku/playwright': patch
---

Scenario recordings can be followed by eye, at no cost to the run. The encode holds each browser step's starting screen, and the last frame, for two seconds (`E2E_VIDEO_STEP_HOLD_MS`, `0` to turn off). The step offsets in the run record account for the holds. Recordings are made at the viewport's own size instead of Playwright's 800px downscale, and they show a pointer that follows the mouse and jumps to each filled field. Drivers get an optional `ScenarioBrowserProvider.markVideoStep(actor)`, which returns a step's offset in the finished video. It is preferred over `videoStartedAt`.
