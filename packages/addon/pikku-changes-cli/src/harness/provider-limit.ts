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

/**
 * How a model provider says the account has run out of paid usage or credit: a person has to add
 * some, waiting does not help. Error text only, like the limit patterns.
 */
export const PROVIDER_QUOTA_PATTERNS: readonly RegExp[] = [
  /out of extra usage/i,
  /\badd more at\b/i,
  /credit balance is too low/i,
  /\binsufficient_quota\b/i,
  /exceeded your current quota/i,
  /\bbilling\b/i,
  /\bpayment required\b/i,
  /\b(?:HTTP|status(?: code)?|code)[\s:=]*402\b|\(402\)/i,
]

/**
 * How a model provider (or Pi on its behalf) says the login it was given cannot be used: a dead OAuth
 * refresh token, a missing or wrong API key, a 401. Error text only, like the limit patterns.
 */
export const PROVIDER_AUTH_PATTERNS: readonly RegExp[] = [
  /OAuth refresh failed/i,
  /\binvalid_grant\b/i,
  /\binvalid_state\b/i,
  /\bNo API key\b/i,
  /\bIncorrect API key\b/i,
  /\binvalid_api_key\b/i,
  /\b(?:HTTP|status(?: code)?|code)[\s:=]*401\b/i,
  /\(401\)|\b401\s+unauthori[sz]ed\b/i,
  /\bunauthori[sz]ed\b/i,
  /\bauthentication failed\b/i,
]

export type ProviderRefusal =
  'provider-limit' | 'provider-quota' | 'provider-auth'

/**
 * Which provider refusal an error text is, if any. Out of paid usage is `provider-quota`, unless the
 * text states when to try again (then it is a limit to wait out); a limit is `provider-limit`; a
 * login that cannot be used is `provider-auth` only when the text is neither of the others.
 */
export const providerRefusalOf = (
  text: string
): ProviderRefusal | undefined => {
  if (PROVIDER_QUOTA_PATTERNS.some((pattern) => pattern.test(text)))
    return retryAfterMsOf(text) === undefined
      ? 'provider-quota'
      : 'provider-limit'
  if (isProviderLimit(text)) return 'provider-limit'
  if (PROVIDER_AUTH_PATTERNS.some((pattern) => pattern.test(text)))
    return 'provider-auth'
  return undefined
}

export const isProviderAuth = (text: string): boolean =>
  providerRefusalOf(text) === 'provider-auth'

export const isProviderQuota = (text: string): boolean =>
  providerRefusalOf(text) === 'provider-quota'

/** What to tell a person whose provider login is unusable: whose, and how to fix it. */
export const providerAuthMessage = (provider: string, model: string): string =>
  `Pi's ${provider} login cannot be used for ${provider}/${model}. Log in again with Pi: run \`pi\`, then \`/login\`.`

/** What to tell a person whose provider account is out of paid usage. */
export const providerQuotaMessage = (provider: string, model: string): string =>
  `The ${provider} account behind ${provider}/${model} is out of usage: add usage to the account or switch the model alias.`

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
