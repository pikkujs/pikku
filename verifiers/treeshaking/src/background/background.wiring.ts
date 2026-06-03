import { wireQueueWorker, wireScheduler } from '#pikku'
import {
  processNotificationQueue,
  runNotificationSweep,
} from './background.functions.js'

wireQueueWorker({
  name: 'notification-queue',
  tags: ['background', 'queue'],
  func: processNotificationQueue,
})

wireScheduler({
  name: 'notificationSweep',
  tags: ['background', 'scheduler'],
  schedule: '0 * * * *',
  func: runNotificationSweep,
})
