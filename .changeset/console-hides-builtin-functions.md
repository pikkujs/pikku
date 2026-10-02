---
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/addon-console': patch
---

The console's Functions page lists only the app's own functions until "Show built-in" is on. Scenarios and scenario steps are recognised by the `scenario` / `scenarioStep` markers their meta already carries, and the analytics ingest, feature-flags, realtime and channel-CLI scaffolds now tag their functions `pikku` like every other scaffold. The overview's function count, the search palette and a package's function list follow the same rule, and the agent tool picker no longer offers scenario steps.
