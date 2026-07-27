---
'@pikku/console': patch
---

Export the workflow surface as composable panels rather than a single screen.

`WorkflowSurface` mounts every workflow-scoped context (panels, run state, graph,
canvas drawer) and the panels below read from it, so a host can arrange them in
any order, anywhere in its own tree:

```tsx
<WorkflowSurface workflowId={id}>
  <WorkflowRunsPanel />
  <WorkflowGraphPanel />
  <WorkflowInspectorPanel />
</WorkflowSurface>
```

New exports: `WorkflowSurface`, `useWorkflowSurface`, `useWorkflowSurfaceSafe`,
`WorkflowRunsPanel`, `WorkflowGraphPanel`, `WorkflowInspectorPanel`,
`WorkflowCanvasDrawer`, `WorkflowListPanel`, `WorkflowThreePane`.

Also exports the workflow-run query keys and an invalidation hook —
`workflowQueryKeys`, `useWorkflowRunRefresh`, plus the `isRunActive` /
`isStepActive` / `hasActiveStep` status predicates — so an embedder that shares
this package's QueryClient can refresh the panels through a supported API
instead of hardcoding key tuples.

Purely additive: `WorkflowsPage` keeps its existing props and renders the same
UI, now composed from these panels.
