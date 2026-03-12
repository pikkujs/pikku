import { wireQueueWorker } from '#pikku'
import { myQueueWorker } from './queue.function.js'

wireQueueWorker({
  name: 'myQueue',
  func: myQueueWorker,
})
