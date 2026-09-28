---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/console': patch
---

The scenarios screen and the runs screen are one surface: the declared suite is the document and a run is a lens over it. A scenario is filed as `running` the moment it starts, so a console watching a run in progress can tell what is on screen now from what is still waiting, and the run snapshots each scenario's title, description and cast so the record reads as prose.
