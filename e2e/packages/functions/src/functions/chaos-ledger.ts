import {
  createScriptContent,
  getText,
  hasKey,
  putText,
} from '../script-content.js'

/**
 * A file-backed record of every side effect the chaos steps perform.
 *
 * It is on disk rather than in a module-level map because the questions it
 * exists to answer span a process restart: after the server is killed mid-run
 * and brought back, did a step that had already succeeded run its body a second
 * time? An in-memory ledger is cleared by the very event under test and would
 * report "ran once" for both the correct and the incorrect outcome.
 *
 * The content service has no append, so an append is a read-modify-write. A
 * per-directory promise chain serialises appends inside this process so that
 * concurrent steps in a parallel branch still add whole lines.
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
  /** The trace this effect ran on, and its own span within it. */
  traceId?: string
  spanId?: string
}

const BUCKET = 'chaos'
const LEDGER_KEY = 'chaos-ledger.jsonl'

const stores = new Map<string, ReturnType<typeof createScriptContent>>()
const queues = new Map<string, Promise<unknown>>()

const storeFor = (dir: string) => {
  let store = stores.get(dir)
  if (!store) {
    store = createScriptContent(dir)
    stores.set(dir, store)
  }
  return store
}

export const recordEffect = (
  dir: string,
  entry: ChaosLedgerEntry
): Promise<void> => {
  const store = storeFor(dir)
  const next = (queues.get(dir) ?? Promise.resolve()).then(async () => {
    const previous = (await hasKey(store, BUCKET, LEDGER_KEY))
      ? await getText(store, BUCKET, LEDGER_KEY)
      : ''
    await putText(
      store,
      BUCKET,
      LEDGER_KEY,
      `${previous}${JSON.stringify(entry)}\n`
    )
  })
  queues.set(
    dir,
    next.catch(() => {})
  )
  return next
}

export const readEffects = async (dir: string): Promise<ChaosLedgerEntry[]> => {
  await queues.get(dir)
  const store = storeFor(dir)
  if (!(await hasKey(store, BUCKET, LEDGER_KEY))) return []
  return (await getText(store, BUCKET, LEDGER_KEY))
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
export const isDependencyDown = (dir: string, name: string): Promise<boolean> =>
  hasKey(storeFor(dir), BUCKET, `down-${name}`)
