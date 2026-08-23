import { wireQueueWorker } from '#pikku/queue'
import { processReminder } from '../functions/queue.functions.js'

// @snippet start wire-queue-worker
wireQueueWorker({
  name: 'todo-reminders',
  func: processReminder,
})
// @snippet end wire-queue-worker
