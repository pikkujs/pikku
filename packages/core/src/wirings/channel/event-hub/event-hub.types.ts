import type { PikkuChannelHandler } from '../channel.types.js'

/**
 * One published event, as a backend receives it. The payload is serialised
 * once per event, whatever number of channels or relays carry it.
 */
export interface EventHubMessage {
  readonly topic: string
  readonly data: unknown
  readonly isBinary: boolean
  /** The text a text transport sends: strings as they are, anything else as JSON with a bigint written as its decimal string. Throws for a binary message. */
  serialized(): string
}

/**
 * Moves an event to the channels of one transport. A delivery backend never
 * decides who gets an event: the distributor hands it the channels whose
 * subscription names the topic.
 */
export interface EventHubDeliveryBackend {
  /** Names the backend in errors. Unique among the registered delivery backends. */
  readonly name: string
  /** Which kind of channel it delivers to (`ws`, `uws`, `bun`, `sse`, `local`). One backend per transport: two would deliver an event twice. */
  readonly transport: string
  /** Delivers to these channels and returns the ids of the ones it could not reach, which the distributor detaches. */
  deliver(
    message: EventHubMessage,
    channels: readonly PikkuChannelHandler[]
  ): readonly string[] | Promise<readonly string[]>
  /** A channel of this transport was attached. */
  onAttach?(channel: PikkuChannelHandler): void
  /** A channel of this transport was detached. */
  onDetach?(channelId: string): void
}

/** An event that came from another instance through a relay. */
export interface EventHubInboundEvent {
  topic: string
  data: unknown
  isBinary: boolean
}

/** What a relay calls when another instance published. Resolves once local delivery has finished. */
export type EventHubInbound = (event: EventHubInboundEvent) => Promise<void>

/**
 * What a relay is registered with. The topics are the only ones it forwards and
 * the only ones it accepts back, written as patterns (`order:${string}`).
 */
export interface EventHubRelayMap {
  topics: readonly string[]
}

/**
 * Carries events between instances. A relay never delivers to a channel: it
 * forwards what this instance published and hands back what others published,
 * and the distributor delivers inbound events to local channels only, so an
 * event is never forwarded twice.
 *
 * `setMap` is a property, not a method, so a relay that wants its own map type
 * is checked against the map passed to `add`.
 */
export interface EventHubRelayBackend<
  TMap extends EventHubRelayMap = EventHubRelayMap,
> {
  /** Names the relay in errors. Unique among the registered relays. */
  readonly name: string
  readonly setMap?: (map: TMap) => void
  /** Sends a locally published event to the other instances. */
  forward(message: EventHubMessage): void | Promise<void>
  /** Called once when registered, with the function to call for each inbound event. */
  start?(receive: EventHubInbound): void | Promise<void>
  /** Called when the distributor closes. */
  stop?(): void | Promise<void>
}

/** What `services.eventHub` is: publish and nothing else. */
export interface EventHubPublisher {
  /**
   * Publishes to every channel subscribed to `topic`, on this instance and on the
   * others through a relay. The topic must be one a subscribe function can
   * return. `data` is JSON-serialised and not typed per topic.
   */
  publish(
    topic: string,
    data: unknown,
    options?: EventHubPublishOptions
  ): Promise<void>
}

export interface EventHubPublishOptions {
  /** A channel id to skip, usually the publishing channel's own. */
  except?: string
  /** The payload is binary and is sent as it is. */
  isBinary?: boolean
}

/** What `services.eventHubRegistry` is: a place to add a relay. */
export interface EventHubRegistry {
  /** Registers a relay with no map type of its own. */
  add(relay: EventHubRelayBackend, map: EventHubRelayMap): void
  /** Registers a relay and gives it its map. `TMap` is inferred from the relay, never from the map argument. */
  add<TMap extends EventHubRelayMap>(
    relay: EventHubRelayBackend<TMap>,
    map: NoInfer<TMap>
  ): void
}

/** What a subscribe function was run with, kept so the sweeper can run it again. */
export interface StoredSubscription {
  pikkuFuncId: string
  wireType: string
  wireId: string
  input: unknown
  session: unknown
  /** Unix milliseconds after which the subscription must be re-checked. */
  expiresAt?: number
}

/** One open subscription. */
export interface EventHubSubscription extends StoredSubscription {
  channelId: string
  topic: string
}

export interface EventHubDistributorOptions {
  /** The topic patterns a subscribe function can return. Read at each use. Nothing is subscribable or publishable that none of them matches. */
  topics: () => readonly string[]
  /** Told about a relay or inbound failure that must not fail the publisher. */
  onError?: (error: unknown) => void
}
