import { wireScheduler } from '#pikku'
import { myScheduledTask } from './scheduler.functions.js'

wireScheduler({
  name: 'myScheduledTask',
  schedule: '*/1 * * * *',
  func: myScheduledTask,
  tags: ['hello'],
})
