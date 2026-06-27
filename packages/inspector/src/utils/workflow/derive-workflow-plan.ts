import type {
  WorkflowStepMeta,
  WorkflowPlannedStep,
} from '@pikku/core/workflow'

/**
 * Derive the static UI plan for a DSL workflow from its extracted step tree.
 *
 * `plannedSteps` is the ordered list of every named step the workflow can run,
 * so a frontend can render the step skeleton up front without executing the
 * workflow or hand-listing steps. It is populated whenever the workflow has NO
 * loops (fanout) — loops make the step COUNT runtime-dependent, so a workflow
 * containing any fanout gets neither field.
 *
 * `deterministic` is true only when the exact executed sequence is known up
 * front: a flat list of named steps with no branches/switches (which pick a
 * path at runtime) and no loops. A branchy-but-loopless workflow is therefore
 * `deterministic: false` but still gets `plannedSteps` (the full set of
 * possible steps, in source order).
 */
export function deriveWorkflowPlan(steps: WorkflowStepMeta[]): {
  deterministic: boolean
  plannedSteps?: WorkflowPlannedStep[]
} {
  if (containsLoop(steps)) {
    return { deterministic: false }
  }
  return {
    deterministic: !containsConditional(steps),
    plannedSteps: collectNamedSteps(steps),
  }
}

/** Any fanout (loop) anywhere in the tree — including inside branches/switches. */
function containsLoop(steps: WorkflowStepMeta[]): boolean {
  return steps.some((step) => {
    switch (step.type) {
      case 'fanout':
        return true
      case 'branch':
        return (
          step.branches.some((b) => containsLoop(b.steps)) ||
          (step.elseSteps ? containsLoop(step.elseSteps) : false)
        )
      case 'switch':
        return (
          step.cases.some((c) => containsLoop(c.steps)) ||
          (step.defaultSteps ? containsLoop(step.defaultSteps) : false)
        )
      default:
        return false
    }
  })
}

/** Any branch/switch — the run takes a runtime-decided path. */
function containsConditional(steps: WorkflowStepMeta[]): boolean {
  return steps.some((step) => step.type === 'branch' || step.type === 'switch')
}

/** Flatten named steps (rpc/inline/sleep/parallel children) in source order. */
function collectNamedSteps(steps: WorkflowStepMeta[]): WorkflowPlannedStep[] {
  const planned: WorkflowPlannedStep[] = []
  for (const step of steps) {
    switch (step.type) {
      case 'rpc':
      case 'inline':
      case 'sleep':
        planned.push({ stepName: step.stepName })
        break
      case 'parallel':
        for (const child of step.children) {
          planned.push({ stepName: child.stepName })
        }
        break
      case 'branch':
        for (const b of step.branches) planned.push(...collectNamedSteps(b.steps))
        if (step.elseSteps) planned.push(...collectNamedSteps(step.elseSteps))
        break
      case 'switch':
        for (const c of step.cases) planned.push(...collectNamedSteps(c.steps))
        if (step.defaultSteps) {
          planned.push(...collectNamedSteps(step.defaultSteps))
        }
        break
      // set / return / cancel / filter / arrayPredicate produce no named step
    }
  }
  return planned
}
