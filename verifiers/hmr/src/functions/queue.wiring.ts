import { wireQueueWorker } from '#pikku/queue'
import { myQueueWorker } from './queue.function.js'

wireQueueWorker({
  name: 'myQueue',
  func: myQueueWorker,
})
