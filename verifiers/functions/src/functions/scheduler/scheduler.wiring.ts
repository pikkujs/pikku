import { wireScheduler } from '#pikku/scheduler'
import { myScheduledTask } from './scheduler.functions.js'

wireScheduler({
  name: 'myScheduledTask',
  schedule: '*/1 * * * *',
  func: myScheduledTask,
  tags: ['hello'],
})
