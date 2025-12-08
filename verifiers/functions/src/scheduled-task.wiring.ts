import { wireScheduler } from '#pikku'
import { myScheduledTask } from './scheduled-task.functions.js'

wireScheduler({
  name: 'myScheduledTask',
  schedule: '*/1 * * * *',
  func: myScheduledTask,
  tags: ['hello'],
})
