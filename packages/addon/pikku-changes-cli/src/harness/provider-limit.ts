/**
 * How a model provider says it refused for a usage or rate limit. Only error text is matched (an
 * error message, stderr), never what the model wrote, so a change about rate limiting is no limit.
 */
export const PROVIDER_LIMIT_PATTERNS: readonly RegExp[] = [
  /usage[ _-]?limit/i,
  /rate[ _-]?limit/i,
  /\bquota\b/i,
  /too many requests/i,
  /\b429\b/,
]

export const isProviderLimit = (text: string): boolean =>
  PROVIDER_LIMIT_PATTERNS.some((pattern) => pattern.test(text))

const UNIT_MS: [RegExp, number][] = [
  [/^(?:ms|msecs?|milliseconds?)$/i, 1],
  [/^(?:s|secs?|seconds?)$/i, 1_000],
  [/^(?:m|mins?|minutes?)$/i, 60_000],
  [/^(?:h|hrs?|hours?)$/i, 3_600_000],
  [/^(?:d|days?)$/i, 86_400_000],
]

const PART = /(\d+(?:\.\d+)?)\s*([a-z]+)/gi
const UNIT =
  'ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?'
const DURATION = new RegExp(
  `(?:try(?:ing)? again|retry|resets?|available again)\\s+(?:in|after)\\s+((?:\\d+(?:\\.\\d+)?\\s*(?:${UNIT})(?![a-z])[\\s,]*(?:and\\s+)?)+)`,
  'i'
)
const AT =
  /(?:try(?:ing)? again|retry|resets?)\s+(?:at|after)\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)/i
const HEADER =
  /retry-after["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)(?![\d.]|[ \t]*[a-z])/i

/**
 * The wait a limit message states, in milliseconds: "try again in 2h 20m", "retry after 30
 * seconds", "resets in 1 hour and 5 minutes", "try again at <ISO time>" or a `Retry-After: <seconds>`
 * header. Undefined when it states none.
 */
export const retryAfterMsOf = (
  text: string,
  now: number = Date.now()
): number | undefined => {
  const duration = DURATION.exec(text)
  if (duration) {
    let total = 0
    for (const [, amount, unit] of duration[1]!.matchAll(PART)) {
      const scale = UNIT_MS.find(([name]) => name.test(unit!))?.[1]
      if (scale !== undefined) total += Number(amount) * scale
    }
    if (total > 0) return Math.round(total)
  }
  const at = AT.exec(text)
  if (at) {
    const when = Date.parse(at[1]!)
    if (Number.isFinite(when)) return Math.max(0, when - now)
  }
  const header = HEADER.exec(text)
  if (header) return Math.round(Number(header[1]) * 1_000)
  return undefined
}
