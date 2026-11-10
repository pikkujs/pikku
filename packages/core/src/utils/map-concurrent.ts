export type MapConcurrentOptions = {
  /** How many calls may be in flight at once. `1` runs them one after another. */
  concurrency: number
  /** Checked before each item starts; aborting rejects with `signal.reason`. Passed to `fn`. */
  signal?: AbortSignal
}

/**
 * `items.map(fn)` with at most `concurrency` calls in flight. Results are in
 * input order. The first rejection rejects the whole call and no new item is
 * started after it (calls already running are not cancelled: pass `signal` to
 * `fn` and abort it yourself if they should stop).
 *
 * Use it in services, functions and scripts instead of `await` inside a loop.
 * Do NOT call it inside a `pikkuWorkflowFunc` body: a workflow step must go
 * through `workflow.do` so it is durable. There, use `for...of` (sequential) or
 * `Promise.all(items.map(...))` with `workflow.do`.
 */
export const mapConcurrent = async <T, R>(
  items: readonly T[],
  fn: (item: T, index: number, signal?: AbortSignal) => Promise<R> | R,
  { concurrency, signal }: MapConcurrentOptions
): Promise<R[]> => {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      `mapConcurrent: concurrency must be an integer of at least 1, got ${concurrency}`
    )
  }
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (!failed && next < items.length) {
      if (signal?.aborted) throw signal.reason
      const index = next++
      try {
        results[index] = await fn(items[index]!, index, signal)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  )
  return results
}
