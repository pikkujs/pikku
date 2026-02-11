import { wireQueueWorker } from '#pikku'
import { queueWorker } from './queue.functions.js'

wireQueueWorker({
  name: 'hello-world-queue',
  func: queueWorker,
})
