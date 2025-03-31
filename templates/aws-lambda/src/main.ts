import { ScheduledHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
import { createSessionServices } from '../../functions/src/services.js'
import { coldStart } from './cold-start.js'

import '../../functions/.pikku/pikku-bootstrap.gen.js'

export const httpRoutes = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await runFetch(singletonServices, createSessionServices, event)
}

export const myScheduledTask: ScheduledHandler = async () => {
  const singletonServices = await coldStart()
  await runScheduledTask({
    name: 'myScheduledTask',
    singletonServices,
  })
}
