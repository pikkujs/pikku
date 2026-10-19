import { wireQueueWorker } from '#pikku/queue/pikku-queue-types.gen.js'
import { executeFlowRun } from '../functions/execute-flow-run.function.js'

/**
 * The engine.
 *
 * `batchSize` is the real knob in an automation platform: it is how many flows
 * can be in flight at once, and therefore how much load the platform puts on
 * everything it is connected to. Two is deliberately conservative for a
 * template — the number that is right here depends entirely on what the flows
 * talk to, and guessing high is how a template teaches somebody to melt a
 * third-party API.
 */
// @snippet start wireQueue
wireQueueWorker({
  name: 'execute-flow-run',
  func: executeFlowRun,
  config: {
    batchSize: 2,
  },
})
// @snippet end wireQueue

import { writeAuditEvent } from '../functions/write-audit-event.function.js'

wireQueueWorker({
  name: 'audit-event',
  func: writeAuditEvent,
})
