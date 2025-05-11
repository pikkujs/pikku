import {
  addScheduledTask,
  pikkuSessionlessFunc
} from '../.pikku/pikku-types.gen.js'

const myScheduledTask = pikkuSessionlessFunc<void, void>(async ({ logger }) => {
  logger.info(
    `This is a scheduled task that runs every minute, running now at ${new Date().getTime()}`
  )
})

addScheduledTask({
  name: 'myScheduledTask',
  schedule: '*/1 * * * *',
  func: myScheduledTask,
  tags: ['hello'],
})
