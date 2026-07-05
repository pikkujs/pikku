---
'@pikku/console': patch
---

Export `ScenariosPage` from the package index so host apps can embed it (it replaced the removed `TestsPage`), and make it reuse a host-provided `ConsoleNavigatorCtx` instead of always wrapping itself in the OSS query-param navigator.
