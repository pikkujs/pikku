import { addScheduledTask } from '../.pikku/pikku-types.gen.js'
import { myScheduledTask } from './scheduled-task.functions.js'

addScheduledTask({
  name: 'myScheduledTask',
  schedule: '*/1 * * * *',
  func: myScheduledTask,
  tags: ['hello'],
})
