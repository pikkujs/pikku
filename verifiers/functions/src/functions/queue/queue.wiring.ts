import { wireQueueWorker } from '#pikku/queue'
import { queueWorker } from './queue.functions.js'

wireQueueWorker({
  name: 'hello-world-queue',
  func: queueWorker,
})
