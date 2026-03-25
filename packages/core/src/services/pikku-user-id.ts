import type { PikkuWire } from '../types/core.types.js'

export type PikkuUserIdResolver = (wire: PikkuWire) => string | undefined

export const defaultPikkuUserIdResolver: PikkuUserIdResolver = (wire) => {
  // Explicit pikkuUserId on wire (set by earlier middleware or runner)
  if (wire.pikkuUserId) return wire.pikkuUserId
  // Session userId (from auth middleware — user-defined session shape)
  const session = wire.session as Record<string, unknown> | undefined
  if (session?.userId && typeof session.userId === 'string')
    return session.userId
  // Queue job: carried in job metadata
  if (wire.queue?.pikkuUserId) return wire.queue.pikkuUserId
  // Workflow: carried in run wire metadata
  if (wire.workflow?.pikkuUserId) return wire.workflow.pikkuUserId
  return undefined
}
