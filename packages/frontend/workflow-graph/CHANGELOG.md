# @pikku/workflow-graph

## 0.12.1

### Patch Changes

- e99c700: Extract the workflow graph renderer into a standalone `@pikku/workflow-graph` package
- d067ac9: Widen the pikku peer ranges to the versions the package actually uses. The
  generated ranges named core 0.12.108, mantine 0.12.13 and react 0.12.11 — one
  release ahead of npm, so the package could not be installed anywhere. It only
  needs `WorkflowsMeta`, `asI18n` and `I18nNode`.
