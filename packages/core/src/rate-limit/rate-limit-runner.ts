import { pikkuState } from '../pikku-state.js'
import {
  MissingServiceError,
  ServiceUnavailableError,
  TooManyRequestsError,
} from '../errors/errors.js'
import type { CoreSingletonServices } from '../types/core.types.js'
import type { RateLimitConfig } from './rate-limit.types.js'

/** The wires a rate limit applies to: the ones a client outside the app reaches. */
export type RateLimitedWire = 'http' | 'mcp'

/** What a limit-checked wire has to say about who is calling and what they are calling. */
export type RateLimitCheck = {
  wire: RateLimitedWire
  /** The route pattern or tool name, so one entry covers every concrete path. */
  scope: string
  /** The function's own `rateLimit`: a config replaces the global one, `false` exempts it. */
  override?: RateLimitConfig | false
  /** The request header holding the client address. Without one every caller shares a bucket. */
  header?: (name: string) => string | null | undefined
  /** A caller identity the wire has once a session exists. */
  sessionId?: string
  singletonServices: CoreSingletonServices
  packageName?: string | null
  /** Sets `Retry-After` on the response before the refusal is thrown. */
  setRetryAfter?: (seconds: number) => void
}

/**
 * Sets the limit every HTTP route and MCP tool falls under unless its function
 * declares its own `rateLimit`. Internal calls (rpc, queue, workflow steps) are
 * never counted.
 *
 * @example snippet: addGlobalRateLimiter
 */
export const addGlobalRateLimiter = (
  config: RateLimitConfig,
  packageName: string | null = null
): RateLimitConfig => {
  pikkuState(packageName, 'rateLimit', 'global').splice(0, 1, config)
  return config
}

const warnedWithoutHeader = new WeakSet<RateLimitConfig>()

const clientAddress = (
  header: RateLimitCheck['header'],
  name: string | undefined
): string | undefined => {
  if (!name || !header) return undefined
  const value = header(name)
  if (!value) return undefined
  const first = value.split(',')[0]?.trim()
  return first || undefined
}

const callerOf = (check: RateLimitCheck, config: RateLimitConfig): string => {
  const address = clientAddress(check.header, config.ipHeader)
  if (address) return `ip:${address}`
  if (check.sessionId) return `session:${check.sessionId}`
  if (!config.ipHeader && !warnedWithoutHeader.has(config)) {
    warnedWithoutHeader.add(config)
    check.singletonServices.logger.warn(
      `A rate limit has no \`ipHeader\`: every caller shares one bucket per route or tool. Name the header your proxy sets with the client address.`
    )
  }
  return '*'
}

/**
 * Counts one external call against its limit and refuses it when the window is
 * full. Runs before the function, auth and validation, so a refused call looks
 * the same whether or not it would have succeeded.
 *
 * @throws TooManyRequestsError (429) when the window is full.
 * @throws MissingServiceError (500) when a limit applies and no `rateLimitService` is configured.
 * @throws ServiceUnavailableError (503) when the store fails, unless the limit sets `onStoreError: 'allow'`.
 */
export const enforceRateLimit = async (
  check: RateLimitCheck
): Promise<void> => {
  if (check.override === false) return
  const config =
    check.override ??
    pikkuState(check.packageName ?? null, 'rateLimit', 'global')[0] ??
    pikkuState(null, 'rateLimit', 'global')[0]
  if (!config) return

  const service = check.singletonServices.rateLimitService
  if (!service) {
    throw new MissingServiceError(
      'A rate limit is set but no `rateLimitService` is configured. Add one to the singleton services, or remove the limit.'
    )
  }

  const key = `rl:${check.wire}:${check.scope}:${callerOf(check, config)}`
  let result
  try {
    result = await service.hit(key, config.limit, config.windowMs)
  } catch (e) {
    check.singletonServices.logger.error(
      `Rate limit store failed: ${e instanceof Error ? e.message : String(e)}`
    )
    if (config.onStoreError === 'allow') return
    throw new ServiceUnavailableError('Rate limiting is unavailable')
  }

  if (result.allowed) return

  const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
  check.setRetryAfter?.(retryAfterSeconds)
  const refusal = new TooManyRequestsError()
  Object.assign(refusal, { payload: { retryAfterMs: result.retryAfterMs } })
  throw refusal
}
