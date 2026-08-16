import { wireScheduler } from '#pikku/scheduler'
import { myScheduledTask } from './scheduled.function.js'

wireScheduler({
  name: 'myScheduledTask',
  schedule: '*/1 * * * *',
  func: myScheduledTask,
})
