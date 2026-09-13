---
'@pikku/workflow-graph': patch
---

Widen the pikku peer ranges to the versions the package actually uses. The
generated ranges named core 0.12.108, mantine 0.12.13 and react 0.12.11 — one
release ahead of npm, so the package could not be installed anywhere. It only
needs `WorkflowsMeta`, `asI18n` and `I18nNode`.
