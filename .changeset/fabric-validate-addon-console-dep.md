---
'@pikku/cli': patch
---

fabric validate: error when scaffold.console is enabled but the functions package does not declare @pikku/addon-console — the generated bootstrap imports it, so pikku dev crash-loops in the sandbox without it
