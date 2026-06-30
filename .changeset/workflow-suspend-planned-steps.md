---
'@pikku/core': patch
'@pikku/inspector': patch
---

fix(workflow): include suspend steps in plannedSteps with readable displayName

`workflow.suspend(reason)` calls now appear in the static `plannedSteps` ladder
produced by `deriveWorkflowPlan`. Previously the inspector ignored them, so the
runtime's `__workflow_suspend:<reason>` steps had no planned counterpart and
the UI appended them as orphans at the bottom of the step list instead of
showing them at the correct position.

Changes:
- `WorkflowPlannedStep` gains an optional `displayName` field — the human-
  readable label to show in the UI (falls back to `stepName` when absent).
- New `SuspendStepMeta` type added to `WorkflowStepMeta`.
- Inspector extracts `workflow.suspend('reason')` calls and emits a
  `SuspendStepMeta` step with `type: 'suspend'` and `reason`.
- `collectNamedSteps` maps a suspend step to
  `{ stepName: '__workflow_suspend:<reason>', displayName: '<reason>' }`,
  matching the key the runtime stores so the UI can overlay live status
  onto the planned position.
