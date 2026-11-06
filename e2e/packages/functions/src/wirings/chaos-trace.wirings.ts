import { wireQueueWorker } from '#pikku/queue'
import { chaosTraceJob } from '../functions/chaos.functions.js'

wireQueueWorker({
  name: 'chaos-trace',
  func: chaosTraceJob,
})
