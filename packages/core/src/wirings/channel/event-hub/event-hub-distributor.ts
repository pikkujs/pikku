import type { PikkuChannelHandler } from '../channel.types.js'
import type {
  EventHubDeliveryBackend,
  EventHubDistributorOptions,
  EventHubInbound,
  EventHubInboundEvent,
  EventHubMessage,
  EventHubPublishOptions,
  EventHubPublisher,
  EventHubRegistry,
  EventHubRelayBackend,
  EventHubRelayMap,
  EventHubSubscription,
  StoredSubscription,
} from './event-hub.types.js'
import { matchesTopicPattern, topicPatternsOverlap } from './topic-pattern.js'

const bigintAsString = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value

const createMessage = (
  topic: string,
  data: unknown,
  isBinary: boolean
): EventHubMessage => {
  let text: string | undefined
  return {
    topic,
    data,
    isBinary,
    serialized: () => {
      if (isBinary) {
        throw new TypeError(`Event hub message on "${topic}" is binary`)
      }
      text ??=
        typeof data === 'string' ? data : JSON.stringify(data, bigintAsString)
      return text
    },
  }
}

interface Attached {
  handler: PikkuChannelHandler
  backend: EventHubDeliveryBackend
  session: unknown
}

interface RegisteredRelay {
  relay: EventHubRelayBackend
  topics: readonly string[]
}

/**
 * The full event hub: the one object that can attach channels and add
 * subscriptions. Only the runtime holds it. Functions get {@link publisher}
 * and apps get {@link registry}, two plain objects with no path back here.
 *
 * Backends only move bytes. A delivery backend sends to the channels of its
 * transport and a relay forwards to other instances; what is subscribed to, and
 * what may be published, is decided here.
 */
export class EventHubDistributor {
  private readonly deliveries = new Map<string, EventHubDeliveryBackend>()
  private readonly relays = new Map<string, RegisteredRelay>()
  private readonly channels = new Map<string, Attached>()
  private readonly byTopic = new Map<string, Set<string>>()
  private readonly stored = new Map<string, Map<string, StoredSubscription>>()

  constructor(private readonly options: EventHubDistributorOptions) {}

  /** Adds the backend that delivers to one transport's channels. Refused when its name or transport is already taken. */
  registerDelivery(backend: EventHubDeliveryBackend): void {
    if (this.deliveries.has(backend.name)) {
      throw new Error(
        `Event hub delivery backend "${backend.name}" is already registered`
      )
    }
    for (const existing of this.deliveries.values()) {
      if (existing.transport === backend.transport) {
        throw new Error(
          `Event hub delivery backend "${backend.name}" cannot be registered: transport "${backend.transport}" is already delivered by "${existing.name}", and two backends would deliver every event twice`
        )
      }
    }
    this.deliveries.set(backend.name, backend)
  }

  /** Makes a connected channel deliverable through `backend`. A channel has one delivery backend for as long as it is attached. */
  attach(
    channel: PikkuChannelHandler,
    backend: EventHubDeliveryBackend,
    session: unknown
  ): void {
    if (this.deliveries.get(backend.name) !== backend) {
      throw new Error(
        `Event hub delivery backend "${backend.name}" is not registered`
      )
    }
    const channelId = channel.getChannel().channelId
    const existing = this.channels.get(channelId)
    if (existing) {
      if (existing.backend !== backend) {
        throw new Error(
          `Event hub channel ${channelId} is already delivered by "${existing.backend.name}"; "${backend.name}" cannot deliver it too`
        )
      }
      return
    }
    this.channels.set(channelId, { handler: channel, backend, session })
    backend.onAttach?.(channel)
  }

  /** Forgets a channel and every subscription it holds. Safe to call for a channel that is not attached. */
  detach(channelId: string): void {
    const attached = this.channels.get(channelId)
    const topics = this.stored.get(channelId)
    if (topics) {
      for (const topic of topics.keys()) this.dropTopicEntry(topic, channelId)
      this.stored.delete(channelId)
    }
    if (attached) {
      this.channels.delete(channelId)
      attached.backend.onDetach?.(channelId)
    }
  }

  isAttached(channelId: string): boolean {
    return this.channels.has(channelId)
  }

  /** Subscribes an attached channel to a concrete topic. Called only after a subscribe function returned it. */
  addSubscription(
    channelId: string,
    topic: string,
    subscription: StoredSubscription
  ): void {
    if (!this.channels.has(channelId)) {
      throw new Error(`Event hub channel ${channelId} is not attached`)
    }
    this.assertDeclared(topic)
    let channelTopics = this.stored.get(channelId)
    if (!channelTopics) {
      channelTopics = new Map()
      this.stored.set(channelId, channelTopics)
    }
    channelTopics.set(topic, subscription)
    let ids = this.byTopic.get(topic)
    if (!ids) {
      ids = new Set()
      this.byTopic.set(topic, ids)
    }
    ids.add(channelId)
  }

  /** Removes one topic from one channel. */
  removeSubscription(channelId: string, topic: string): void {
    const channelTopics = this.stored.get(channelId)
    if (!channelTopics?.delete(topic)) return
    if (channelTopics.size === 0) this.stored.delete(channelId)
    this.dropTopicEntry(topic, channelId)
  }

  /** Every open subscription with what is needed to run its subscribe function again. */
  subscriptions(): EventHubSubscription[] {
    const all: EventHubSubscription[] = []
    for (const [channelId, topics] of this.stored) {
      for (const [topic, record] of topics) {
        all.push({ channelId, topic, ...record })
      }
    }
    return all
  }

  subscriptionCount(): number {
    let count = 0
    for (const topics of this.stored.values()) count += topics.size
    return count
  }

  /** Delivers to local subscribers and forwards to the relays whose map names the topic. */
  async publish(
    topic: string,
    data: unknown,
    options: EventHubPublishOptions = {}
  ): Promise<void> {
    this.assertDeclared(topic)
    const message = createMessage(topic, data, options.isBinary === true)
    await Promise.all([
      this.deliverLocally(message, options.except),
      this.forward(message),
    ])
  }

  /** `services.eventHub`: publish and nothing else. */
  publisher(): EventHubPublisher {
    const publish: EventHubPublisher['publish'] = (topic, data, options) =>
      this.publish(topic, data, options)
    return Object.freeze({ publish })
  }

  /** `services.eventHubRegistry`: add a relay and nothing else. */
  registry(): EventHubRegistry {
    const add = (relay: EventHubRelayBackend, map: EventHubRelayMap) =>
      this.addRelay(relay, map)
    return Object.freeze({ add }) as EventHubRegistry
  }

  /** Stops every relay. */
  async close(): Promise<void> {
    for (const { relay } of this.relays.values()) {
      try {
        await relay.stop?.()
      } catch (error) {
        this.options.onError?.(error)
      }
    }
  }

  private addRelay(
    relay: EventHubRelayBackend & { setMap?: (map: never) => void },
    map: EventHubRelayMap
  ): void {
    if (
      map === null ||
      typeof map !== 'object' ||
      !Array.isArray(map.topics) ||
      map.topics.length === 0
    ) {
      throw new Error(
        `eventHubRegistry.add needs a map naming the topics relay "${relay.name}" carries`
      )
    }
    if (this.relays.has(relay.name)) {
      throw new Error(`Event hub relay "${relay.name}" is already registered`)
    }
    for (const [name, existing] of this.relays) {
      for (const mine of map.topics) {
        for (const theirs of existing.topics) {
          if (topicPatternsOverlap(mine, theirs)) {
            throw new Error(
              `Event hub relay "${relay.name}" overlaps relay "${name}" on "${mine}" and "${theirs}": an event on both would be relayed twice`
            )
          }
        }
      }
    }
    relay.setMap?.(map as never)
    const topics = [...map.topics]
    this.relays.set(relay.name, { relay, topics })
    const receive: EventHubInbound = (event) => this.receive(topics, event)
    try {
      const started = relay.start?.(receive)
      if (started) {
        started.catch((error) => this.options.onError?.(error))
      }
    } catch (error) {
      this.options.onError?.(error)
    }
  }

  private async receive(
    relayTopics: readonly string[],
    event: EventHubInboundEvent
  ): Promise<void> {
    try {
      if (
        !relayTopics.some((pattern) =>
          matchesTopicPattern(pattern, event.topic)
        )
      ) {
        throw new Error(
          `Event hub dropped an inbound event on "${event.topic}": the relay does not carry that topic`
        )
      }
      this.assertDeclared(event.topic)
      await this.deliverLocally(
        createMessage(event.topic, event.data, event.isBinary),
        undefined
      )
    } catch (error) {
      this.options.onError?.(error)
    }
  }

  private async deliverLocally(
    message: EventHubMessage,
    except: string | undefined
  ): Promise<void> {
    const ids = this.byTopic.get(message.topic)
    if (!ids) return
    const groups = new Map<EventHubDeliveryBackend, PikkuChannelHandler[]>()
    for (const channelId of ids) {
      if (channelId === except) continue
      const attached = this.channels.get(channelId)
      if (!attached) continue
      const group = groups.get(attached.backend)
      if (group) group.push(attached.handler)
      else groups.set(attached.backend, [attached.handler])
    }
    await Promise.all(
      [...groups].map(async ([backend, handlers]) => {
        try {
          for (const failed of await backend.deliver(message, handlers)) {
            this.detach(failed)
          }
        } catch (error) {
          this.options.onError?.(error)
        }
      })
    )
  }

  private async forward(message: EventHubMessage): Promise<void> {
    await Promise.all(
      [...this.relays.values()]
        .filter(({ topics }) =>
          topics.some((pattern) => matchesTopicPattern(pattern, message.topic))
        )
        .map(async ({ relay }) => {
          try {
            await relay.forward(message)
          } catch (error) {
            this.options.onError?.(error)
          }
        })
    )
  }

  private assertDeclared(topic: string): void {
    if (
      !this.options
        .topics()
        .some((pattern) => matchesTopicPattern(pattern, topic))
    ) {
      throw new Error(
        `"${topic}" is not a declared event hub topic: no subscribe function can return it`
      )
    }
  }

  private dropTopicEntry(topic: string, channelId: string): void {
    const ids = this.byTopic.get(topic)
    if (!ids) return
    ids.delete(channelId)
    if (ids.size === 0) this.byTopic.delete(topic)
  }
}

/**
 * Creates the distributor a host holds for the life of the process. Hand
 * `publisher()` and `registry()` to `createSingletonServices` and keep the
 * distributor itself out of services.
 */
export const createEventHubDistributor = (
  options: EventHubDistributorOptions
): EventHubDistributor => new EventHubDistributor(options)
