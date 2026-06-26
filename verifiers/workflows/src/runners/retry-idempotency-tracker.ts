/**
 * In-process tracker for the retry/idempotency verifiers.
 *
 * Step functions run in the same process as the runner (the queue workers are
 * registered in-process), so a module-level map is the simplest way to observe
 * exactly how many times a step executed, with which `invocationId`/`stepId`/
 * `attemptCount`, and whether an invocationId-keyed side effect was applied more
 * than once. The runner asserts against these observations.
 */

export interface StepExecution {
  invocationId: string
  stepId: string
  attemptCount: number
}

const executions = new Map<string, StepExecution[]>()
const applied = new Map<string, Set<string>>() // key -> invocationIds that ran the side effect
const sideEffects = new Map<string, number>() // key -> times the side effect actually ran

export const tracker = {
  reset(key: string): void {
    executions.set(key, [])
    applied.set(key, new Set())
    sideEffects.set(key, 0)
  },

  record(key: string, execution: StepExecution): void {
    const list = executions.get(key) ?? []
    list.push(execution)
    executions.set(key, list)
  },

  /**
   * Apply a side effect exactly once per invocationId. Returns true if applied
   * now, false if this invocationId already applied it (a retry). This is the
   * idempotency pattern the stable invocationId enables: a side effect that
   * crashed mid-flight is NOT re-run on retry.
   */
  applyOnce(key: string, invocationId: string): boolean {
    const seen = applied.get(key) ?? new Set()
    if (seen.has(invocationId)) {
      applied.set(key, seen)
      return false
    }
    seen.add(invocationId)
    applied.set(key, seen)
    sideEffects.set(key, (sideEffects.get(key) ?? 0) + 1)
    return true
  },

  executions(key: string): StepExecution[] {
    return executions.get(key) ?? []
  },

  count(key: string): number {
    return this.executions(key).length
  },

  sideEffectCount(key: string): number {
    return sideEffects.get(key) ?? 0
  },
}
