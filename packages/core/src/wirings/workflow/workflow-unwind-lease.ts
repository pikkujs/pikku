import { LeaseTakenError } from '../../services/lease-service.js'
import type { Logger } from '../../services/logger.js'

type UnwindOutcome = 'waiting' | 'finished'

/**
 * One unwind per run in this process, which is all that excludes a second
 * driver on a store whose run lease is a pass-through. A caller that arrives
 * while one is active never waits for it: the active driver goes round again,
 * since what the caller has to report may be newer than what it last read.
 *
 */
class UnwindExclusion {
  private readonly active = new Map<string, { again: boolean }>()

  async run(
    runId: string,
    drive: () => Promise<UnwindOutcome>,
    onLeaseTaken?: () => Promise<void>
  ): Promise<UnwindOutcome> {
    const running = this.active.get(runId)
    if (running) {
      running.again = true
      return 'waiting'
    }
    const state = { again: false }
    this.active.set(runId, state)
    let refused = false
    try {
      let outcome: UnwindOutcome = 'waiting'
      do {
        state.again = false
        refused = false
        try {
          outcome = await drive()
        } catch (error) {
          if (!onLeaseTaken || !(error instanceof LeaseTakenError)) throw error
          refused = true
        }
      } while (state.again && outcome === 'waiting')
      if (!refused) return outcome
    } finally {
      this.active.delete(runId)
    }
    await onLeaseTaken!()
    return 'waiting'
  }
}

/** What driving a run's unwind needs from the workflow service. */
export type RunUnwindHost = {
  withRunLease<T>(runId: string, fn: () => Promise<T>): Promise<T>
  getRun(runId: string): Promise<{ status: string } | null>
  logger(): Logger | undefined
  /** `driveUnwind` itself. Only to be called under the run's lease. */
  unwind(runId: string): Promise<UnwindOutcome>
  /** Ask for the run to be looked at again, where there is a queue to ask. */
  wake(runId: string): Promise<void>
}

/**
 * Where every compensation of one workflow service is driven from.
 *
 * knowledge: decisions/internals/a-run-unwinds-only-under-its-run-lease.md
 */
export class RunUnwinds {
  private readonly exclusion = new UnwindExclusion()

  /**
   * `leaseHeld` is for the pass that already holds the run's lease, which cannot
   * be taken twice.
   */
  drive(
    host: RunUnwindHost,
    runId: string,
    leaseHeld: boolean
  ): Promise<UnwindOutcome> {
    if (leaseHeld) {
      return this.exclusion.run(runId, () => host.unwind(runId))
    }
    return this.exclusion.run(
      runId,
      () => host.withRunLease(runId, () => host.unwind(runId)),
      () => host.wake(runId)
    )
  }

  /**
   * One pass over a run, under its lease. A cancel that arrived too late for the
   * pass to see could not take the lease to unwind, so it is done here once the
   * lease is free.
   */
  async runPass(
    host: RunUnwindHost,
    runId: string,
    pass: () => Promise<void>
  ): Promise<void> {
    let held = false
    try {
      await host.withRunLease(runId, () => {
        held = true
        return pass()
      })
    } finally {
      if (held) await this.driveLeftBehind(host, runId)
    }
  }

  private async driveLeftBehind(
    host: RunUnwindHost,
    runId: string
  ): Promise<void> {
    try {
      if ((await host.getRun(runId))?.status !== 'compensating') return
      await this.drive(host, runId, false)
    } catch (error) {
      // Thrown from a `finally`, so it must not replace how the pass ended.
      host
        .logger()
        ?.error(
          `Workflow run ${runId}: could not continue its unwind after a pass`,
          error
        )
    }
  }
}
