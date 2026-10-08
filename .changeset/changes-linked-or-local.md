---
'@pikku/cli': minor
'@pikku/skills': patch
---

`pikku changes` keeps its list in one place, chosen by the project. A project not linked to Fabric uses the local file, as before. A project linked to Fabric (`FABRIC_PROJECT_ID`, or `fabric.projectId` in `pikku.config.json`) uses the Fabric API only: no local copy, so a re-clone or a sleeping sandbox cannot lose the list. A linked project that is signed out or offline fails with a clear message and changes nothing; an offline queue is postponed. The CLI reads its token from `FABRIC_TOKEN` before `~/.fabric/auth.json`, and `PIKKU_CHANGES_DIR` moves the local file for a host that owns the location. The old write-through (local first, then register) is gone.
