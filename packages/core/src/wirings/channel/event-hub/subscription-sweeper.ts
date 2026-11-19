import {
  getCreateWireServices,
  getSingletonServices,
} from '../../../pikku-state.js'
import { runPikkuFunc } from '../../../function/function-runner.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../../services/user-session-service.js'
import { withLiveScopes } from '../../../scopes.js'
import type { CoreUserSession } from '../../../types/core.types.js'
import type { EventHubDistributor } from './event-hub-distributor.js'
import type { EventHubSubscription } from './event-hub.types.js'
import { subscriptionKeepsTopic } from './runtime.js'

export interface SubscriptionSweeperOptions {
  distributor: EventHubDistributor
  /**
   * How often every open subscription is re-checked, in milliseconds. Core
   * cannot see how long a scope grant lives in the auth provider, so the host
   * says how stale an open stream may be.
   */
  recheckIntervalMs: number
  /**
   * Runs a subscribe function again and returns the topic it now answers with,
   * or throws. The default runs it through `runPikkuFunc` on the stored session
   * with its scopes re-read from the scope service.
   */
  rerun?: (subscription: EventHubSubscription) => Promise<unknown>
  /** Told about a re-run that failed, which drops the subscription. */
  onError?: (error: unknown, subscription: EventHubSubscription) => void
}

export interface SubscriptionSweeper {
  /** Checks every open subscription once. Resolves when all have been settled. */
  sweep(): Promise<void>
  /** Sweeps every `recheckIntervalMs` until `stop`. The timer never keeps the process alive. */
  start(): void
  stop(): void
}

/**
 * Re-runs the subscribe function of every open subscription. One that now
 * throws (a scope or permission was withdrawn) or names a different topic is
 * dropped, and a subscription past its `expiresAt` is dropped without a re-run.
 * The stored session is the one the client connected with, so the re-run asks
 * what that session may follow now, not what it could follow then.
 */
export const createSubscriptionSweeper = (
  options: SubscriptionSweeperOptions
): SubscriptionSweeper => {
  const { distributor } = options
  const rerun =
    options.rerun ??
    rerunSubscribeFunction(distributor, (subscription, session) =>
      liveSessions.set(subscription, session)
    )
  let timer: ReturnType<typeof setInterval> | undefined
  let sweeping: Promise<void> | undefined
  // The session the default re-run read scopes into, so the runs-topic scope check sees the live grant.
  const liveSessions = new WeakMap<EventHubSubscription, unknown>()

  const check = async (subscription: EventHubSubscription): Promise<void> => {
    const { channelId, topic } = subscription
    if (
      subscription.expiresAt !== undefined &&
      distributor.now() >= subscription.expiresAt
    ) {
      await distributor.dropSubscription(channelId, topic)
      return
    }
    try {
      const next = await rerun(subscription)
      if (
        next === topic &&
        subscriptionKeepsTopic(
          subscription,
          topic,
          (liveSessions.get(subscription) ?? subscription.session) as
            { scopes?: string[] } | undefined
        )
      )
        return
    } catch (error) {
      options.onError?.(error, subscription)
    }
    await distributor.dropSubscription(channelId, topic)
  }

  const sweep = (): Promise<void> => {
    // A slow re-run must not stack a second sweep on top of the first.
    sweeping ??= Promise.all(
      distributor.subscriptions().map((subscription) => check(subscription))
    )
      .then(() => undefined)
      .finally(() => {
        sweeping = undefined
      })
    return sweeping
  }

  return {
    sweep,
    start() {
      if (timer) return
      timer = setInterval(() => {
        sweep().catch((error) => distributorError(distributor, error))
      }, options.recheckIntervalMs)
      timer.unref?.()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = undefined
    },
  }
}

const distributorError = (
  _distributor: EventHubDistributor,
  _error: unknown
) => {
  // Every failure inside a sweep is already settled per subscription.
}

const rerunSubscribeFunction =
  (
    distributor: EventHubDistributor,
    onSession: (subscription: EventHubSubscription, session: unknown) => void
  ) =>
  async (subscription: EventHubSubscription): Promise<unknown> => {
    const packageName = subscription.packageName ?? null
    const singletonServices = getSingletonServices()
    if (!singletonServices) {
      throw new Error(
        'No singleton services are set; cannot re-run a subscribe function'
      )
    }
    const handler = distributor.channelHandler(subscription.channelId)
    if (!handler) {
      throw new Error(`Event hub channel ${subscription.channelId} is gone`)
    }
    const session = await withLiveScopes(
      subscription.session as CoreUserSession | undefined,
      (singletonServices as { scopeService?: any }).scopeService
    )
    onSession(subscription, session)
    const sessionService = new PikkuSessionService<CoreUserSession>()
    if (session) sessionService.setInitial(session)
    return runPikkuFunc(
      subscription.wireType as 'http' | 'channel',
      subscription.wireId,
      subscription.pikkuFuncId,
      {
        singletonServices,
        createWireServices: getCreateWireServices(),
        auth: session !== undefined,
        data: () => subscription.input,
        wire: {
          channel: handler.getChannel(),
          ...createMiddlewareSessionWireProps(sessionService),
        },
        sessionService,
        packageName,
      }
    )
  }
