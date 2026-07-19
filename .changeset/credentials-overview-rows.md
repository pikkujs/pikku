---
'@pikku/console': patch
---

Render the Credentials overview as rows (the shared EntityCardList used by
Workflows and Agents) instead of a card grid. Each row shows the credential's
type, the addon that declares it (when it comes from one), its connected status,
and inline connect/disconnect actions; clicking a row opens the owning addon's
setup. The owner mapping is built from the installed addons' declared
credentials so it stays accurate as addons are added or removed.
