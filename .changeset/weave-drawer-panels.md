---
'@pikku/console': patch
---

Expose the detail-panel system (`PanelProvider`, `usePanelContext`, `PanelContainer`, `PanelType`, `PanelData`) so an embedder can open the same right-hand configuration panels the console pages use, keyed by wire type + id. Adds a read-only `email` panel (rendered template preview) and an `openEmail` opener.
