import { wireQueueWorker } from '#pikku/queue/pikku-queue-types.gen.js'
import { recordView } from '../functions/record-view.function.js'

// @snippet start wireQueue
wireQueueWorker({
  name: 'record-view',
  func: recordView,
  config: {
    // Higher than the other templates on purpose: view counting is the one
    // workload here that is genuinely high-volume and genuinely lossy-tolerant,
    // so throughput matters more than ordering or exactly-once.
    batchSize: 8,
  },
})
// @snippet end wireQueue

import { writeAuditEvent } from '../functions/write-audit-event.function.js'

wireQueueWorker({
  name: 'audit-event',
  func: writeAuditEvent,
})
