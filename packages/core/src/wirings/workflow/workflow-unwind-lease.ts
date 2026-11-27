import { LeaseTakenError } from '../../services/lease-service.js'

type UnwindOutcome = 'waiting' | 'finished'

/**
 * One unwind per run in this process, which is all that excludes a second
 * driver on a store whose run lease is a pass-through. A caller that arrives
 * while one is active never waits for it: the active driver goes round again,
 * since what the caller has to report may be newer than what it last read.
 *
 * knowledge: decisions/internals/a-run-unwinds-only-under-its-run-lease.md
 */
export class UnwindExclusion {
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
