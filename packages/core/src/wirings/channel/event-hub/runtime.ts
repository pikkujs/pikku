import { getAllPackageStates, pikkuState } from '../../../pikku-state.js'
import type { EventHubDistributor } from './event-hub-distributor.js'
import type { PikkuChannelHandler } from '../channel.types.js'
import type { StoredSubscription } from './event-hub.types.js'
import { matchesTopicPattern } from './topic-pattern.js'
import { OTLP_RUNS_SCOPE, OTLP_RUNS_TOPIC } from '../../../otlp/runs/live.js'
import { hasScopes } from '../../../scopes.js'

/**
 * The distributor this process delivers through, or undefined when the host
 * never set one. Held in package state so every copy of core agrees on it.
 */
export const getEventHubDistributor = (): EventHubDistributor | undefined =>
  pikkuState(null, 'package', 'eventHubDistributor') ?? undefined

/** Registers the process's distributor. Called by the host, never by a function. */
export const setEventHubDistributor = (
  distributor: EventHubDistributor | undefined
): void => {
  pikkuState(null, 'package', 'eventHubDistributor', distributor ?? null)
}

/**
 * The `topicPattern` a function declared with `pikkuSubscribeFunc`, or
 * undefined for any other function.
 */
export const getSubscribeMeta = (
  pikkuFuncId: string,
  packageName: string | null | undefined
): { topicPattern: string } | undefined =>
  pikkuState(packageName ?? null, 'function', 'meta')[pikkuFuncId]?.subscribe

/**
 * Subscribes a channel to the topic a subscribe function returned. Nothing a
 * client sent decides the topic: the function did, after the session, scopes
 * and permissions it declares had all passed. The topic must also match the
 * pattern that function declared, so a function cannot reach a topic another
 * function's scopes guard.
 */
export const subscribeChannelToTopic = (
  distributor: EventHubDistributor,
  channel: PikkuChannelHandler,
  topic: unknown,
  subscription: StoredSubscription
): void => {
  if (typeof topic !== 'string' || topic === '') {
    throw new Error(
      `Subscribe function '${subscription.pikkuFuncId}' must return a topic string, got ${typeof topic}`
    )
  }
  const declared = getSubscribeMeta(
    subscription.pikkuFuncId,
    subscription.packageName
  )?.topicPattern
  if (declared === undefined || !matchesTopicPattern(declared, topic)) {
    throw new Error(
      `Subscribe function '${subscription.pikkuFuncId}' returned a topic outside the pattern it declared`
    )
  }
  if (
    topic === OTLP_RUNS_TOPIC &&
    !hasScopes(
      [OTLP_RUNS_SCOPE],
      (subscription.session as { scopes?: string[] } | undefined)?.scopes
    )
  ) {
    throw new Error(
      `Subscribe function '${subscription.pikkuFuncId}' returned '${OTLP_RUNS_TOPIC}', which needs the '${OTLP_RUNS_SCOPE}' scope`
    )
  }
  distributor.addSubscription(
    channel.getChannel().channelId,
    topic,
    subscription
  )
}

/**
 * Every topic pattern a subscribe function of any package declared, read from
 * function meta at each call. This is what the distributor checks a publish
 * and a subscription against when the host gives it no list of its own.
 */
/**
 * True when a subscription that returned `topic` may keep it: the function
 * still declares a pattern covering it, and the runs topic still has its scope.
 */
export const subscriptionKeepsTopic = (
  subscription: StoredSubscription,
  topic: string,
  session: { scopes?: string[] } | undefined
): boolean => {
  const declared = getSubscribeMeta(
    subscription.pikkuFuncId,
    subscription.packageName
  )?.topicPattern
  if (declared === undefined || !matchesTopicPattern(declared, topic))
    return false
  return (
    topic !== OTLP_RUNS_TOPIC || hasScopes([OTLP_RUNS_SCOPE], session?.scopes)
  )
}

export const getDeclaredEventHubTopics = (): string[] => {
  const patterns = new Set<string>()
  for (const state of getAllPackageStates().values()) {
    for (const meta of Object.values(state.function.meta)) {
      if (meta.subscribe?.topicPattern)
        patterns.add(meta.subscribe.topicPattern)
    }
  }
  return [...patterns]
}
