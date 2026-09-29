# @pikku/workflow-graph

## 0.12.2

### Patch Changes

- 5586749: Workflow graphs keep the main path straight and show the route a run took: taken edges are solid, untaken ones dotted. Parallel steps join into what follows, loop bodies return to their loop, and branch, switch, parallel and loop markers are compact with readable condition labels. Set, sleep and suspend nodes say what they set, how long they wait, and what they wait for.
- Updated dependencies [f02585e]
- Updated dependencies [5586749]
  - @pikku/core@0.12.127

## 0.12.1

### Patch Changes

- e99c700: Extract the workflow graph renderer into a standalone `@pikku/workflow-graph` package
- d067ac9: Widen the pikku peer ranges to the versions the package actually uses. The
  generated ranges named core 0.12.108, mantine 0.12.13 and react 0.12.11 — one
  release ahead of npm, so the package could not be installed anywhere. It only
  needs `WorkflowsMeta`, `asI18n` and `I18nNode`.
