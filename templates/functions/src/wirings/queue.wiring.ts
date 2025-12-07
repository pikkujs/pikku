import { wireQueueWorker } from '../../.pikku/pikku-types.gen.js'
import { processReminder } from '../functions/queue.functions.js'

wireQueueWorker({
  queueName: 'todo-reminders',
  func: processReminder,
})
