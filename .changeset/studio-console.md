---
'@pikku/console': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

Studio mode: the console shows Welcome, Choose your AI and Projects when Studio serves it, and opens projects through Studio with no password. `pikku dev` accepts Studio's per-run token as the console owner's session, and project ideas use the AI chosen in Studio.

Exports `PersonasPage`, `ProjectSurfacePage` and `TranslationsPage` so a host can mount them directly.
