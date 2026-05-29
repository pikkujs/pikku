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
 * Each process holds one dedicated LISTEN connection. Publishing fans out
 * locally first (zero extra latency for the publishing instance's own
 * clients) then sends NOTIFY so every other instance delivers the event
 * to its own connected WebSocket clients.
 *
 * Payload limit: Postgres caps NOTIFY payloads at 8 kB. Keep event data
 * small; for large payloads publish an ID and fetch the full record on
 * the receiving side.
 */
export class PgEventHubService<
  Topics extends Record<string, unknown> = {},
> implements EventHubService<Topics> {
  private local = new LocalEventHubService<Topics>()
  private sql: postgres.Sql | null = null

  constructor(private readonly connectionString: string) {}

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
      this.local.publish(
        parsed.topic as keyof Topics,
        null,
        parsed.data as Topics[keyof Topics]
      )
    })
  }

  async close(): Promise<void> {
    await this.sql?.end()
    this.sql = null
  }

  subscribe<T extends keyof Topics>(topic: T, channelId: string): void {
    this.local.subscribe(topic, channelId)
  }

  unsubscribe<T extends keyof Topics>(topic: T, channelId: string): void {
    this.local.unsubscribe(topic, channelId)
  }

  async publish<T extends keyof Topics>(
    topic: T,
    channelId: string | null,
    data: Topics[T],
    isBinary?: boolean
  ): Promise<void> {
    // Fan out to local clients immediately — no network round-trip
    this.local.publish(topic, channelId, data, isBinary)

    // Broadcast to all other instances via Postgres NOTIFY (instanceId prevents self-delivery)
    if (this.sql) {
      await this.sql.notify(
        PG_CHANNEL,
        JSON.stringify({ instanceId: INSTANCE_ID, topic, data })
      )
    }
  }

  onChannelOpened(channelHandler: ChannelHandler): void {
    this.local.onChannelOpened(channelHandler)
  }

  onChannelClosed(channelId: string): void {
    this.local.onChannelClosed(channelId)
  }
}
