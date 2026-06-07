import type {
  CoreUserSession,
  PikkuWire,
  PikkuWiringTypes,
} from '../types/core.types.js'

export type AuditDurability = 'best-effort' | 'transactional'
export type AuditOutcome = 'success' | 'failed' | 'denied'
export type AuditSource = 'auto' | 'explicit'

export type AuditConfig =
  | boolean
  | {
      durability?: AuditDurability
    }

export type ResolvedAuditConfig = {
  durability: AuditDurability
}

export type AuditActor = {
  userId?: string
  orgId?: string
  pikkuUserId?: string
}

export type AuditEvent = {
  eventId?: string
  type: string
  source: AuditSource
  outcome?: AuditOutcome
  occurredAt: string
  functionId?: string
  wireType?: PikkuWiringTypes
  wireId?: string
  traceId?: string
  transactionId?: string | null
  queryId?: string | null
  actor?: AuditActor
  input?: unknown
  metadata?: Record<string, unknown>
}

export type AuditEventBatch = AuditEvent[]

export interface AuditService {
  audit(event: AuditEvent): Promise<void>
  write?(batch: AuditEventBatch): Promise<void>
}

export class NoopAuditService implements AuditService {
  async audit(_event: AuditEvent): Promise<void> {}

  async write(_batch: AuditEventBatch): Promise<void> {}
}

export type AuditLogWriteInput = Omit<AuditEvent, 'occurredAt'>

export interface AuditLog {
  readonly config: ResolvedAuditConfig | undefined
  write(event: AuditLogWriteInput): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}

class DisabledInvocationAudit implements AuditLog {
  public readonly config = undefined
  private warned = false

  constructor(
    private readonly wire: PikkuWire<any, any, any, CoreUserSession>
  ) {}

  async write(_event: AuditLogWriteInput): Promise<void> {
    if (!this.warned) {
      this.warned = true
      ;(this.wire as any).logger?.warn?.(
        'audit.write() called for an invocation without wire.audit enabled'
      )
    }
  }

  async flush(): Promise<void> {}

  async close(): Promise<void> {}
}

class InvocationAuditLog implements AuditLog {
  private readonly buffer: AuditEvent[] = []

  constructor(
    public readonly config: ResolvedAuditConfig,
    private readonly service: AuditService,
    private readonly wire: PikkuWire<any, any, any, CoreUserSession>
  ) {}

  async write(event: AuditLogWriteInput): Promise<void> {
    const resolved = this.resolveEvent(event)

    if (this.config.durability === 'transactional') {
      await this.service.audit(resolved)
      return
    }

    this.buffer.push(resolved)
  }

  async flush(): Promise<void> {
    if (
      this.config.durability === 'transactional' ||
      this.buffer.length === 0
    ) {
      return
    }

    const batch = this.buffer.splice(0, this.buffer.length)
    const queryEvents = batch.filter((event) => event.queryId != null)
    if (queryEvents.length === 1) {
      queryEvents[0]!.queryId = null
    }

    try {
      if (this.service.write) {
        await this.service.write(batch)
        return
      }

      for (const event of batch) {
        await this.service.audit(event)
      }
    } catch (error) {
      ;(this.wire as any).logger?.warn?.(
        'best-effort audit flush failed',
        error
      )
    }
  }

  async close(): Promise<void> {
    await this.flush()
  }

  private resolveEvent(event: AuditLogWriteInput): AuditEvent {
    return {
      functionId: this.wire.functionId,
      wireType: this.wire.wireType,
      wireId: this.wire.wireId,
      traceId: this.wire.traceId,
      actor: event.actor ?? resolveAuditActorFromWire(this.wire),
      ...event,
      occurredAt: new Date().toISOString(),
    }
  }
}

export const resolveAuditConfig = (
  config?: AuditConfig
): ResolvedAuditConfig | undefined => {
  if (config === true) {
    return { durability: 'best-effort' }
  }

  if (!config) {
    return undefined
  }

  return {
    durability: config.durability ?? 'best-effort',
  }
}

export const createInvocationAudit = (
  service: AuditService,
  wire: PikkuWire<any, any, any, CoreUserSession>
): AuditLog => {
  if (!wire.audit) {
    return new DisabledInvocationAudit(wire)
  }

  return new InvocationAuditLog(wire.audit, service, wire)
}

export const resolveAuditActorFromWire = (
  wire: PikkuWire<any, any, any, CoreUserSession>
): AuditActor | undefined => {
  const session = wire.session as CoreUserSession | undefined
  const actor: AuditActor = {
    userId: session?.userId,
    orgId: session?.orgId,
    pikkuUserId: wire.pikkuUserId,
  }

  if (!actor.userId && !actor.orgId && !actor.pikkuUserId) {
    return undefined
  }

  return actor
}
