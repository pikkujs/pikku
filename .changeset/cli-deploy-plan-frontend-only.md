---
'@pikku/cli': patch
---

`pikku deploy plan` on a project with no backend units (a frontend-only app) now writes an empty deployment manifest, infra manifest and a successful `--resultFile` instead of exiting without them, so a frontend-only project deploys its frontend rather than failing the build.
