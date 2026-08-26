import postgres from 'postgres'
import { LocalEventHubService } from '@pikku/core/channel/local'
import type { EventHubService } from '@pikku/core/channel'

const PG_CHANNEL = 'pikku_eventhub'
const INSTANCE_ID = `${process.pid}-${Date.now()}`

type LocalHub = LocalEventHubService<Record<string, unknown>>
type ChannelHandler = Parameters<LocalHub['onChannelOpened']>[0]

/**
 * Multi-instance EventHub backed by Postgres LISTEN/NOTIFY.
 *
 * Wraps a `delivery` hub that owns the connected clients and does the in-process
 * fan-out, then layers Postgres NOTIFY on top so an event published on one
 * instance also reaches clients connected to every OTHER instance.
 *
 * By default the delivery hub is a built-in `LocalEventHubService` (holds
 * channel handlers and calls `.send()` — the right fit for the Node HTTP
 * server). Pass an `inner` transport hub to reuse the SAME hub the server holds
 * its sockets on — e.g. a `BunEventHubService`, whose delivery rides Bun's
 * native per-socket topic pub/sub. This is REQUIRED on Bun: the server registers
 * live sockets on its own `BunEventHubService`, so a function's
 * `eventHub.publish(...)` only reaches them if this service delivers through
 * that very instance instead of a private `LocalEventHubService` the sockets
 * were never registered on. The server keeps its direct reference to the inner
 * hub for the socket lifecycle (`registerSocket`/`setServer`); this wrapper
 * only decorates the subscribe/publish surface plus the NOTIFY backplane.
 *
 * Payload limit: Postgres caps NOTIFY payloads at 8 kB. Keep event data
 * small; for large payloads publish an ID and fetch the full record on
 * the receiving side.
 */
export class PgEventHubService<
  Topics extends Record<string, unknown> = {},
> implements EventHubService<Topics> {
  // Built-in fallback hub, used as `delivery` when no transport hub is injected.
  private readonly local = new LocalEventHubService<Topics>()
  // Where subscribe/unsubscribe/publish and NOTIFY-relayed events are delivered:
  // the injected transport hub when supplied, otherwise the built-in `local`.
  private readonly delivery: EventHubService<Topics>
  private sql: postgres.Sql | null = null

  constructor(
    private readonly connectionString: string,
    inner?: EventHubService<Topics>
  ) {
    this.delivery = inner ?? this.local
  }

  async init(): Promise<void> {
    // Dedicated single-connection pool — pooled connections can't hold LISTEN state
    this.sql = postgres(this.connectionString, { max: 1 })
    await this.sql.listen(PG_CHANNEL, (raw) => {
      let parsed: { instanceId: string; topic: string; data: unknown }
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
      // Skip if this NOTIFY originated from this instance — already fanned out locally in publish()
      if (parsed.instanceId === INSTANCE_ID) return
      // Deliver the remote event to THIS instance's connected clients. `delivery`
      // may be sync (local) or async (transport); normalize so a rejection can't
      // become an unhandled promise.
      Promise.resolve(
        this.delivery.publish(
          parsed.topic as keyof Topics,
          null,
          parsed.data as Topics[keyof Topics]
        )
      ).catch((err) =>
        console.error(
          `[PgEventHubService] failed delivering relayed event on '${String(parsed.topic)}':`,
          err
        )
      )
    })
  }

  async close(): Promise<void> {
    await this.sql?.end()
    this.sql = null
  }

  subscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void {
    return this.delivery.subscribe(topic, channelId)
  }

  unsubscribe<T extends keyof Topics>(
    topic: T,
    channelId: string
  ): Promise<void> | void {
    return this.delivery.unsubscribe(topic, channelId)
  }

  async publish<T extends keyof Topics>(
    topic: T,
    channelId: string | null,
    data: Topics[T],
    isBinary?: boolean
  ): Promise<void> {
    // Fan out to this instance's own clients immediately — no network round-trip
    await this.delivery.publish(topic, channelId, data, isBinary)

    // Broadcast to all other instances via Postgres NOTIFY (instanceId prevents self-delivery)
    if (this.sql) {
      await this.sql.notify(
        PG_CHANNEL,
        JSON.stringify({ instanceId: INSTANCE_ID, topic, data })
      )
    }
  }

  /**
   * Lifecycle follows `delivery`, NOT `local`, and the difference matters.
   *
   * Every other method routes to `delivery`, so registering a channel on `local`
   * while an inner transport hub is injected would put the channel on one hub and
   * its subscription on another — the channel would open and never receive.
   * `delivery` is `local` when nothing is injected, so the no-inner case is
   * unchanged.
   */
  onChannelOpened(channelHandler: ChannelHandler): Promise<void> | void {
    return this.delivery.onChannelOpened(channelHandler)
  }

  onChannelClosed(channelId: string): Promise<void> | void {
    return this.delivery.onChannelClosed(channelId)
  }
}
