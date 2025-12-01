import { wireQueueWorker } from '../.pikku/pikku-types.gen.js'
import { queueWorker } from './queue-worker.functions.js'

wireQueueWorker({
  queueName: 'hello-world-queue',
  func: queueWorker,
})
