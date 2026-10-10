---
'@pikku/cli': patch
---

`pikku changes file` in a project linked to Fabric picks the stage itself: the one on the checked-out branch, else the project's only stage, and `--stage-id` still wins. A sandbox, which may not list stages, files through `createSandboxChange`, so the change lands on its own branch. Before this, a linked `file` sent the placeholder stage `local` to Fabric and failed.
