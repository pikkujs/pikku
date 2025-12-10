import { wireQueueWorker } from '#pikku'
import { queueWorker } from './queue.functions.js'

wireQueueWorker({
  queueName: 'hello-world-queue',
  func: queueWorker,
})
