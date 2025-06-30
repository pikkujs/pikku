import { addQueueProcessor } from '../.pikku/pikku-types.gen.js'
import { queueProcessor } from './queue-processor.functions.js'

addQueueProcessor({
  queueName: 'hello-world-queue',
  func: queueProcessor,
})
