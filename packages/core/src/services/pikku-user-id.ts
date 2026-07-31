import type { PikkuRawWire } from '../types/core.types.js'

export type PikkuUserIdResolver = (wire: PikkuRawWire) => string | undefined

export const defaultPikkuUserIdResolver: PikkuUserIdResolver = (wire) => {
  if (wire.pikkuUserId) return wire.pikkuUserId
  const session = wire.session as Record<string, unknown> | undefined
  if (session?.userId && typeof session.userId === 'string')
    return session.userId
  if (wire.queue?.pikkuUserId) return wire.queue.pikkuUserId
  if (wire.workflow?.pikkuUserId) return wire.workflow.pikkuUserId
  return undefined
}
