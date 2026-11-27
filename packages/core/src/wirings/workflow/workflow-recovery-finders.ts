import { WorkflowStepWrites } from './workflow-step-writes.js'
import type { PendingApproval, ScheduledStep } from './workflow-recovery.js'

/**
 * What recovery asks a store to find. Each returns nothing by default, for a
 * store that cannot express the query.
 */
export abstract class WorkflowRecoveryFinders extends WorkflowStepWrites {
  /**
   * Runs in one of `DRIVEN_RUN_STATUSES` and not written since `before`, oldest
   * first. Recovery drives each under its lease and leaves alone whatever is
   * still being worked. A store that can list runs by status overrides this.
   */
  protected async findRunsAwaitingDriver(
    _before: Date,
    _limit: number,
    _offset: number
  ): Promise<string[]> {
    return []
  }

  /**
   * Ids of runs that are stalled: `running` or `compensating`, with no step
   * something is expected to complete (`scheduled`, `suspended`, `running` or
   * `cancelling` under a live lease, or parked on an unsettled child run), and
   * no step activity since `before`.
   *
   * A lapsed lease is a dispatch that died, so it holds nothing out of the
   * sweep. Nor does a `running` step with no lease and no child run: that is
   * work inside an orchestration pass, whose owner is the run's lease, which the
   * sweep checks before it touches the run.
   *
   * Returns nothing by default, for a store that cannot express the query.
   */
  protected async findStalledRunIds(
    _before: Date,
    _limit: number
  ): Promise<string[]> {
    return []
  }

  /**
   * Runs holding a step `pending` since before `before`. A store overriding it
   * needs an atomic `claimStepForExecution` (see `sweepUndispatchedSteps`).
   */
  protected async findUndispatchedSteps(
    _before: Date,
    _limit: number
  ): Promise<Array<{ runId: string; stepId: string }>> {
    return []
  }

  /**
   * Steps parked on `scheduled` on a `running` or `compensating` run, oldest
   * first, a page at a time. Returns nothing by default, for a store whose runs
   * die with the process.
   */
  protected async findScheduledSteps(
    _limit: number,
    _offset: number
  ): Promise<ScheduledStep[]> {
    return []
  }

  /**
   * The open approval gates of `suspended` runs untouched since `before`, oldest
   * first, a page at a time. Returns nothing by default, for a store that cannot
   * express the query.
   */
  protected async findPendingApprovals(
    _before: Date,
    _limit: number,
    _offset: number
  ): Promise<PendingApproval[]> {
    return []
  }
}
