import { pikkuState } from '../../../pikku-state.js'
import type { EventHubDistributor } from './event-hub-distributor.js'
import type { PikkuChannelHandler } from '../channel.types.js'
import type { StoredSubscription } from './event-hub.types.js'

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
 * and permissions it declares had all passed.
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
  distributor.addSubscription(
    channel.getChannel().channelId,
    topic,
    subscription
  )
}
