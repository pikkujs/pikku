import type { CoreUserSession, PikkuWire } from '../types/core.types.js'
import type { Logger } from '../services/logger.js'
import type {
  AnalyticsClientContext,
  AnalyticsEventBase,
  AnalyticsEventInput,
  AnalyticsLog,
  AnalyticsRecord,
  AnalyticsService,
} from './analytics.types.js'

/**
 * Split a declared event into the shape a service stores.
 *
 * The app declares events as `{ name, ...props }`, so removing the
 * discriminator here — rather than in each service — keeps `props` free of a
 * field that is already the series key, which would otherwise be stored twice
 * and diverge under renames.
 */
export const flattenAnalyticsEvent = (
  event: AnalyticsEventBase,
  at?: number
): AnalyticsEventInput => {
  const { name, ...props } = event
  return { name, props, ...(at === undefined ? {} : { at }) }
}

/**
 * The buffer one invocation records into.
 *
 * Identity, trace and wire fields are resolved here rather than in the service
 * for the same reason {@link flattenAnalyticsEvent} lives here: two
 * implementations that each derived the user from the session would eventually
 * disagree about who it was.
 */
class InvocationAnalyticsLog implements AnalyticsLog {
  private readonly buffer: AnalyticsRecord[] = []

  constructor(
    private readonly service: AnalyticsService,
    private readonly wire: PikkuWire<any, any, any, CoreUserSession>,
    private readonly logger?: Logger
  ) {}

  async record(
    event: AnalyticsEventBase,
    client?: AnalyticsClientContext
  ): Promise<void> {
    this.buffer.push(this.resolveEvent(event, client))
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const batch = this.buffer.splice(0, this.buffer.length)
    try {
      if (this.service.write) {
        await this.service.write(batch)
        return
      }
      for (const event of batch) {
        await this.service.record(event)
      }
    } catch (error) {
      const logger = this.wire.logger ?? this.logger
      logger?.warn?.('analytics flush failed', error)
    }
  }

  async close(): Promise<void> {
    await this.flush()
  }

  private resolveEvent(
    event: AnalyticsEventBase,
    client?: AnalyticsClientContext
  ): AnalyticsRecord {
    const session = this.wire.session as CoreUserSession | undefined
    const { name, props } = flattenAnalyticsEvent(event)
    return {
      name,
      props,
      occurredAt: new Date().toISOString(),
      ...(client?.at === undefined ? {} : { at: client.at }),
      userIdentity: {
        userId: session?.userId ?? null,
        orgId: session?.orgId,
        pikkuUserId: this.wire.pikkuUserId,
      },
      traceId: this.wire.traceId,
      functionId: this.wire.functionId,
      wireType: this.wire.wireType,
      source: client === undefined ? 'server' : 'client',
    }
  }
}

export const createInvocationAnalytics = (
  service: AnalyticsService,
  wire: PikkuWire<any, any, any, CoreUserSession>,
  logger?: Logger
): AnalyticsLog => new InvocationAnalyticsLog(service, wire, logger)
