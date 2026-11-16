import postgres from 'postgres'
import type {
  EventHubInbound,
  EventHubMessage,
  EventHubRelayBackend,
} from '@pikku/core/channel'

/** What the relay needs of a Postgres connection: `postgres`'s own `Sql` satisfies it. */
export interface PgNotifyClient {
  listen(channel: string, onNotify: (payload: string) => void): Promise<unknown>
  notify(channel: string, payload: string): Promise<unknown>
  end(): Promise<void>
}

export interface PgEventHubRelayOptions {
  /** The LISTEN/NOTIFY channel. Instances that share events share this. Defaults to `pikku_eventhub`. */
  channel?: string
  /** Tells this instance's own notifications from the others'. Defaults to a per-process value. */
  instanceId?: string
}

/**
 * Postgres NOTIFY refuses a payload of 8000 bytes or more. The relay refuses
 * earlier and says which topic, rather than letting Postgres fail the publish.
 */
export const PG_NOTIFY_MAX_BYTES = 8000

interface Wire {
  instanceId: string
  topic: string
  isBinary: boolean
  /** Text as published, or base64 for a binary payload. */
  data: string
}

const toBytes = (data: unknown): Uint8Array =>
  data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : (() => {
          throw new TypeError('A binary event hub message needs binary data')
        })()

/**
 * Carries events between instances over Postgres LISTEN/NOTIFY. Register it with
 * `services.eventHubRegistry.add(new PgEventHubRelay(url), { topics: [...] })`.
 *
 * It only moves bytes. It forwards what this instance published and hands back
 * what other instances published; the distributor delivers inbound events to
 * this instance's channels, re-checks the topic against the map and never
 * forwards it again, so an event is delivered once per channel.
 *
 * Postgres caps a NOTIFY payload at 8 kB: publish an id and fetch the record on
 * the other side for anything larger.
 */
export class PgEventHubRelay implements EventHubRelayBackend {
  readonly name = 'postgres'
  private sql: PgNotifyClient | null = null
  private readonly channel: string
  private readonly instanceId: string

  constructor(
    private readonly connection: string | PgNotifyClient,
    options: PgEventHubRelayOptions = {}
  ) {
    this.channel = options.channel ?? 'pikku_eventhub'
    this.instanceId = options.instanceId ?? `${process.pid}-${Date.now()}`
  }

  async start(receive: EventHubInbound): Promise<void> {
    // A dedicated single connection: a pooled one cannot hold LISTEN state.
    this.sql =
      typeof this.connection === 'string'
        ? (postgres(this.connection, { max: 1 }) as unknown as PgNotifyClient)
        : this.connection
    await this.sql.listen(this.channel, (raw) => {
      let wire: Wire
      try {
        wire = JSON.parse(raw)
      } catch {
        return
      }
      if (wire.instanceId === this.instanceId) return
      if (typeof wire.topic !== 'string' || typeof wire.data !== 'string')
        return
      const isBinary = wire.isBinary === true
      receive({
        topic: wire.topic,
        isBinary,
        data: isBinary ? Buffer.from(wire.data, 'base64') : wire.data,
      }).catch(() => {})
    })
  }

  async forward(message: EventHubMessage): Promise<void> {
    if (!this.sql) {
      throw new Error('PgEventHubRelay has not started; cannot forward')
    }
    const wire: Wire = {
      instanceId: this.instanceId,
      topic: message.topic,
      isBinary: message.isBinary,
      data: message.isBinary
        ? Buffer.from(toBytes(message.data)).toString('base64')
        : message.serialized(),
    }
    const payload = JSON.stringify(wire)
    const bytes = Buffer.byteLength(payload)
    if (bytes >= PG_NOTIFY_MAX_BYTES) {
      throw new Error(
        `Event on "${message.topic}" is ${bytes} bytes as a Postgres NOTIFY payload; the limit is ${PG_NOTIFY_MAX_BYTES - 1}. Publish an id and fetch the record on the receiving instance.`
      )
    }
    await this.sql.notify(this.channel, payload)
  }

  async stop(): Promise<void> {
    await this.sql?.end()
    this.sql = null
  }
}
