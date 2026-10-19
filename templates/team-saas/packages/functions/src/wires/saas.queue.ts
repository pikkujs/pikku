import { wireQueueWorker } from '#pikku/queue/pikku-queue-types.gen.js'
import { sendInvitation } from '../functions/send-invitation.function.js'

// @snippet start wireQueue
wireQueueWorker({
  name: 'send-invitation',
  func: sendInvitation,
  config: {
    // The constraint is the mail provider, not this process — draining faster
    // than the downstream accepts converts a backlog into a pile of 429s.
    batchSize: 2,
  },
})
// @snippet end wireQueue

import { writeAuditEvent } from '../functions/write-audit-event.function.js'

wireQueueWorker({
  name: 'audit-event',
  func: writeAuditEvent,
})
