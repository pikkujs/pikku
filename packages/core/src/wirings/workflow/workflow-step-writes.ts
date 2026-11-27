import { isExpectedError } from '../../errors/error-handler.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import { STEP_SOURCES } from './workflow-constants.js'
import { WorkflowStepSupersededError } from './workflow-errors.js'
import type {
  StepState,
  StepStatus,
  WorkflowRunMirror,
} from './workflow.types.js'

/** The writes that move a step, each one conditional on where the step stands. */
export abstract class WorkflowStepWrites {
  /** Apply a write to the store, then to the mirror. */
  protected abstract mirrored<T>(
    write: () => Promise<T>,
    mirror: (mirror: WorkflowRunMirror, written: T) => Promise<void>
  ): Promise<T>

  /**
   * A step write applies only while the step is in a status that may precede it
   * and, when `attempt` is given, while that attempt still owns it. Each `Impl`
   * makes that check and its write one atomic operation, and reports whether it
   * applied. A refused outcome throws `WorkflowStepSupersededError`.
   *
   * knowledge: decisions/internals/workflow-state-is-written-only-from-a-state-that-may-precede-it.md
   */
  private async stepWrite(
    write: () => Promise<boolean>,
    mirror: (mirror: WorkflowRunMirror) => Promise<void>
  ): Promise<boolean> {
    return this.mirrored(write, async (target, applied) => {
      if (applied) await mirror(target)
    })
  }

  public async setStepRunning(stepId: string, attempt?: number): Promise<void> {
    const applied = await this.stepWrite(
      () => this.setStepRunningImpl(stepId, STEP_SOURCES.running, attempt),
      (mirror) => mirror.setStepRunning(stepId)
    )
    if (!applied) throw new WorkflowStepSupersededError(stepId, attempt)
  }

  protected abstract setStepRunningImpl(
    stepId: string,
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<boolean>

  /**
   * Push the claim on a `running` step forward, so it keeps reading as owned
   * for another lease.
   *
   * Does nothing by default, which leaves a store that records no lease exactly
   * as it was: its `running` steps are owned until they move on their own, and
   * a dispatch that dies takes the step with it. A store that overrides this
   * gains recovery from a lost worker, through both `claimStepForExecution` and
   * `recoverStalledRuns`.
   *
   * `null` releases the lease without ending the step, for a step that is
   * legitimately `running` with no worker on it — one parked on a child run,
   * which the child's completion drives rather than a redispatch.
   * `attempt` fences it to the claim that holds it.
   *
   * The lease runs `leaseMs` from now on the store's own clock, so workers
   * whose clocks disagree still agree on when it lapses. Resolves `false` when
   * the step is no longer this attempt's to renew.
   */
  public async refreshStepLease(
    _stepId: string,
    _leaseMs: number | null,
    _attempt?: number
  ): Promise<boolean> {
    return true
  }

  /** Does nothing to a step a worker has already claimed. */
  public async setStepScheduled(stepId: string): Promise<void> {
    await this.stepWrite(
      () => this.setStepScheduledImpl(stepId, STEP_SOURCES.scheduled),
      (mirror) => mirror.setStepScheduled(stepId)
    )
  }

  protected abstract setStepScheduledImpl(
    stepId: string,
    from: readonly StepStatus[]
  ): Promise<boolean>

  /** `attempt` fences it: a newer claim's step throws `WorkflowStepSupersededError`. */
  public async setStepResult(
    stepId: string,
    result: any,
    attempt?: number,
    from: readonly StepStatus[] = STEP_SOURCES.outcome
  ): Promise<void> {
    const applied = await this.stepWrite(
      () => this.setStepResultImpl(stepId, result, attempt, from),
      (mirror) => mirror.setStepResult(stepId, result)
    )
    if (!applied) throw new WorkflowStepSupersededError(stepId, attempt)
  }

  protected abstract setStepResultImpl(
    stepId: string,
    result: any,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean>

  /** Resolves `false`, linking nothing, when the step is no longer in flight. */
  public async setStepChildRunId(
    stepId: string,
    childRunId: string
  ): Promise<boolean> {
    return this.stepWrite(
      () =>
        this.setStepChildRunIdImpl(stepId, childRunId, STEP_SOURCES.inFlight),
      (mirror) => mirror.setStepChildRunId(stepId, childRunId)
    )
  }

  protected abstract setStepChildRunIdImpl(
    stepId: string,
    childRunId: string,
    from: readonly StepStatus[]
  ): Promise<boolean>

  public async setStepError(
    stepId: string,
    error: Error,
    attempt?: number,
    from: readonly StepStatus[] = STEP_SOURCES.outcome
  ): Promise<void> {
    const applied = await this.stepWrite(
      () => this.setStepErrorImpl(stepId, error, attempt, from),
      (mirror) => {
        const serialized: SerializedError = {
          message: error.message,
          stack: error.stack,
          code: (error as { code?: string }).code,
          expected: isExpectedError(error),
        }
        return mirror.setStepError(stepId, serialized)
      }
    )
    if (!applied) throw new WorkflowStepSupersededError(stepId, attempt)
  }

  protected abstract setStepErrorImpl(
    stepId: string,
    error: Error,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean>

  /** Of two callers retrying one attempt, only one gets the new one. */
  public async createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running',
    attempt?: number
  ): Promise<StepState> {
    const newStep = await this.mirrored(
      () =>
        this.createRetryAttemptImpl(
          failedStepId,
          status,
          STEP_SOURCES.retry,
          attempt
        ),
      async (mirror, created) => {
        if (!created) return
        await mirror.createRetryAttempt(failedStepId, {
          ...created,
          stepName: (created as { stepName?: string }).stepName ?? '',
        })
      }
    )
    if (!newStep) {
      throw new WorkflowStepSupersededError(failedStepId, attempt)
    }
    return newStep
  }

  /** Resolves `null`, creating nothing, when the attempt cannot be retried. */
  protected abstract createRetryAttemptImpl(
    failedStepId: string,
    status: 'pending' | 'running',
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<StepState | null>

  public async setBranchTaken(
    stepId: string,
    branchKey: string
  ): Promise<void> {
    await this.stepWrite(
      () => this.setBranchTakenImpl(stepId, branchKey, STEP_SOURCES.inFlight),
      (mirror) => mirror.setBranchTaken(stepId, branchKey)
    )
  }

  protected abstract setBranchTakenImpl(
    stepId: string,
    branchKey: string,
    from: readonly StepStatus[]
  ): Promise<boolean>
}
