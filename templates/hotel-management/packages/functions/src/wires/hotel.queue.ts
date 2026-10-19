import { wireQueueWorker } from '#pikku/queue/pikku-queue-types.gen.js'
import { scheduleTurnover } from '../functions/schedule-turnover.function.js'

/**
 * Retries are worth having here and would be wrong elsewhere: raising a
 * turnover task twice leaves a duplicate on a board somebody can dismiss,
 * whereas never raising it leaves a guest walking into a dirty room.
 */
// @snippet start wireQueue
wireQueueWorker({
  name: 'schedule-turnover',
  func: scheduleTurnover,
  config: {
    // Total worker concurrency. Four is a floor's worth of turnovers being
    // raised at once, which is what a mid-morning checkout wave looks like.
    batchSize: 4,
  },
})
// @snippet end wireQueue

import { writeAuditEvent } from '../functions/write-audit-event.function.js'

wireQueueWorker({
  name: 'audit-event',
  func: writeAuditEvent,
})
