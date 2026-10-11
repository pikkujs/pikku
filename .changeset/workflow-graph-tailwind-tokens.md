---
'@pikku/workflow-graph': patch
---

Nodes, edges and badges are styled with Tailwind classes over the shadcn tokens (`--card`, `--border`, `--muted-foreground`, `--chart-1` to `--chart-5`) instead of component-library primitives. Node accents take `--pikku-node-<colorKey>` and run statuses take `--pikku-status-<status>`. The host app now needs Tailwind scanning this package's source.
