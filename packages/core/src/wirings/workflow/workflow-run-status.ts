import type { HistoryEntry } from './run-timeline.js'
import type {
  StepStatus,
  WorkflowRun,
  WorkflowRunStatus,
} from './workflow.types.js'

/** A run's status with each step folded to its latest attempt. */
export function summarizeRunStatus(
  run: WorkflowRun,
  history: HistoryEntry[]
): WorkflowRunStatus {
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])

  const stepMap = new Map<
    string,
    {
      status: StepStatus
      startedAt?: Date
      completedAt?: Date
      attempts: number
    }
  >()
  for (const step of history) {
    const existing = stepMap.get(step.stepName)
    if (!existing || step.updatedAt > existing.completedAt!) {
      stepMap.set(step.stepName, {
        status: step.status,
        startedAt: step.runningAt ?? step.createdAt,
        completedAt: step.succeededAt ?? step.failedAt,
        attempts: step.attemptCount,
      })
    }
  }

  const steps = [...stepMap.entries()].map(([name, s]) => ({
    name,
    status: s.status,
    duration:
      s.startedAt && s.completedAt
        ? s.completedAt.getTime() - s.startedAt.getTime()
        : undefined,
    attempts: s.attempts,
  }))

  return {
    id: run.id,
    status: run.status,
    startedAt: run.createdAt,
    completedAt: terminalStatuses.has(run.status) ? run.updatedAt : undefined,
    deterministic: run.deterministic,
    plannedSteps: run.plannedSteps,
    steps,
    output: run.status === 'completed' ? run.output : undefined,
    error: run.error
      ? { message: run.error.message ?? 'Unknown error' }
      : undefined,
  }
}
