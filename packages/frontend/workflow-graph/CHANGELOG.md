# @pikku/workflow-graph

## 0.12.4

### Patch Changes

- 9bd0b68: Move lucide-react to 1.
- 674af8a: Bump every external dependency to its latest minor or patch release.
- Updated dependencies [3a9c9d8]
- Updated dependencies [dc952a8]
- Updated dependencies [7e44a0c]
- Updated dependencies [8ec91f0]
- Updated dependencies [ffbe1a2]
- Updated dependencies [9999ec1]
- Updated dependencies [228faad]
- Updated dependencies [84de1eb]
- Updated dependencies [e659614]
- Updated dependencies [6c79f8d]
- Updated dependencies [fa308d4]
- Updated dependencies [0a4676a]
- Updated dependencies [674af8a]
- Updated dependencies [135811c]
- Updated dependencies [6a254e4]
- Updated dependencies [a88391a]
- Updated dependencies [3df9013]
  - @pikku/core@0.12.144
  - @pikku/react@0.12.17

## 0.12.3

### Patch Changes

- 0fdd9b1: Nodes, edges and badges are styled with Tailwind classes over the shadcn tokens (`--card`, `--border`, `--muted-foreground`, `--chart-1` to `--chart-5`) instead of component-library primitives. Node accents take `--pikku-node-<colorKey>` and run statuses take `--pikku-status-<status>`. The host app now needs Tailwind scanning this package's source.
- Updated dependencies [b04e444]
- Updated dependencies [d3d8a98]
- Updated dependencies [e71857d]
- Updated dependencies [658da50]
  - @pikku/core@0.12.141
  - @pikku/react@0.12.15

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
