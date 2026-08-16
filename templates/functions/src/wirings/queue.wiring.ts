import { wireQueueWorker } from '#pikku/queue'
import { processReminder } from '../functions/queue.functions.js'

wireQueueWorker({
  name: 'todo-reminders',
  func: processReminder,
})
