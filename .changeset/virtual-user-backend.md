---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector-go': patch
---

A virtual user can declare `backend`, the backend it signs into. `pikku scenario run` builds one HTTP virtual-user set per backend, each against that backend's url in the run environment.
