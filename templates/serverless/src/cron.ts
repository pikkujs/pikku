import { ScheduledHandler } from 'aws-lambda'
import '../../functions/.pikku/pikku-schedules.gen'

import { runScheduledTask } from '@pikku/core/scheduler'
import { coldStart } from './cold-start.js'

export const myScheduledTask: ScheduledHandler = async () => {
  const singletonServices = await coldStart()
  await runScheduledTask({
    name: 'myScheduledTask',
    singletonServices,
  })
}
