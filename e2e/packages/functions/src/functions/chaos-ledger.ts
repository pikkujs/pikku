import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'

/**
 * A file-backed record of every side effect the chaos steps perform.
 *
 * It is on disk rather than in a module-level map because the questions it
 * exists to answer span a process restart: after the server is killed mid-run
 * and brought back, did a step that had already succeeded run its body a second
 * time? An in-memory ledger is cleared by the very event under test and would
 * report "ran once" for both the correct and the incorrect outcome.
 *
 * Appends are single `O_APPEND` writes so that concurrent steps in a parallel
 * branch interleave whole lines instead of corrupting each other.
 */
export type ChaosLedgerEntry = {
  key: string
  runId: string
  /**
   * The step's stable dedupe key. Recorded because it is what distinguishes a
   * legitimate retry of one logical call (same invocationId, higher attempt)
   * from the same call being dispatched twice (two invocationIds) — the two
   * look identical if you only count effects.
   */
  invocationId?: string
  attempt: number
  at: number
  detail?: unknown
}

const ledgerPath = (dir: string) => join(dir, 'chaos-ledger.jsonl')

export const recordEffect = (dir: string, entry: ChaosLedgerEntry): void => {
  const path = ledgerPath(dir)
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(entry)}\n`)
}

export const readEffects = (dir: string): ChaosLedgerEntry[] => {
  const path = ledgerPath(dir)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ChaosLedgerEntry)
}

/**
 * An externally flippable failure switch, so a dependency can be "healed"
 * partway through a run and a retry observed to succeed for a reason other
 * than attempt count. `attemptCount` alone can only express flakiness that
 * resolves itself on a schedule the workflow already knows.
 */
export const isDependencyDown = (dir: string, name: string): boolean =>
  existsSync(join(dir, `down-${name}`))
