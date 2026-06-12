---
'@pikku/cli': patch
---

Fix `pikku dev` startup ordering so generated bootstrap is loaded after `allWorkflow` regeneration instead of before it. This avoids stale bootstrap/module-state hangs during dev startup on projects with heavy generated wiring graphs.
