import type { ScorerInput } from './ai-scorer.types.js'

/**
 * The last few finished runs, held so a scenario can grade one.
 *
 * A scenario cannot rebuild a `ScorerInput` from storage: the run record holds
 * status and usage, and the prompt, answer and tool calls are spread across the
 * thread's messages, where the boundary of a single run is not recoverable. So
 * the runtime keeps the snapshot it already took at finalize — which is also
 * what makes a scenario's grade comparable to a live one, since both grade the
 * identical object, redactions included.
 *
 * Off unless something turns it on, and bounded when it is. A process that
 * grades no scenarios holds nothing, and one that does cannot accumulate run
 * content without limit.
 */
const snapshots = new Map<string, ScorerInput>()

let limit = 0

/**
 * Start retaining snapshots. Called where the scenario grading RPC is
 * registered, so the buffer exists in exactly the processes that can read it —
 * a development server — and never in a deployed bundle.
 */
export const enableScoreSnapshots = (maxRuns = 50): void => {
  limit = maxRuns
}

export const recordScoreSnapshot = (run: ScorerInput): void => {
  if (limit === 0) return
  snapshots.set(run.runId, run)
  while (snapshots.size > limit) {
    const oldest = snapshots.keys().next().value
    if (oldest === undefined) break
    snapshots.delete(oldest)
  }
}

export const getScoreSnapshot = (runId: string): ScorerInput | undefined =>
  snapshots.get(runId)

export const resetScoreSnapshots = (): void => {
  snapshots.clear()
  limit = 0
}
