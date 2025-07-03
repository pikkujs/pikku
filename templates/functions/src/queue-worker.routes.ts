import { addQueueWorker } from '../.pikku/pikku-types.gen.js'
import { queueWorker } from './queue-worker.functions.js'

addQueueWorker({
  queueName: 'hello-world-queue',
  func: queueWorker,
})
