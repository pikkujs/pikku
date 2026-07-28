/** How long to keep trying, and how long to wait between tries. */
export interface PollOptions {
  /** Total time to keep attempting before giving up. Default 15s. */
  timeoutMs?: number
  /** Gap between attempts. Default 250ms. */
  intervalMs?: number
}

/**
 * Attempt something until it answers, or the deadline passes.
 *
 * `undefined` means "not yet" and nothing else — `false`, `0` and `''` are all
 * answers, because a probe asking whether something happened reports `false`
 * when it did not. Answering `undefined` at the deadline rather than throwing
 * leaves the error to the caller, who is the only one who knows what was being
 * waited for.
 *
 * A step that polls its target — a delivery reaching a terminal status, a run
 * finishing — reaches for this rather than writing the deadline loop again.
 */
export const pollUntil = async <T>(
  attempt: () => Promise<T | undefined> | T | undefined,
  { timeoutMs = 15_000, intervalMs = 250 }: PollOptions = {}
): Promise<T | undefined> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const answer = await attempt()
    if (answer !== undefined) {
      return answer
    }
    if (Date.now() >= deadline) {
      return undefined
    }
    await new Promise((done) => setTimeout(done, intervalMs))
  }
}
