---
'@pikku/core': patch
'@pikku/playwright': patch
---

Scenario recordings can be followed by eye. A recorded window now holds for two seconds after each browser step (`E2E_VIDEO_STEP_PAUSE_MS`, `0` to turn off; runs without video are never slowed), records at the viewport's own size instead of Playwright's 800px downscale, and shows a pointer that travels to each target and marks each click (Playwright 1.6x `showActions`; older versions record without it). Drivers get an optional `ScenarioBrowserProvider.settleStep(actor)`, called after each browser step.
