import { wireScheduler } from '#pikku'
import { myScheduledTask } from './scheduled.function.js'

wireScheduler({
  name: 'myScheduledTask',
  schedule: '*/1 * * * *',
  func: myScheduledTask,
})
