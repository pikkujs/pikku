export interface PollOptions {
  timeoutMs?: number
  intervalMs?: number
}

/**
 * Retries an assertion until it passes or the timeout runs out — for the
 * eventually-consistent parts of a scenario (a queued job, a projection).
 *
 * @example snippet: scenarioPolling
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
