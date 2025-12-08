import { wireQueueWorker } from '#pikku'
import { queueWorker } from './queue-worker.functions.js'

wireQueueWorker({
  queueName: 'hello-world-queue',
  func: queueWorker,
})
