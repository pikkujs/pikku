import { ScheduledHandler, SQSHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
import { runSQSQueueMessage } from '@pikku/lambda/queue'
import { createSessionServices } from '../../functions/src/services.js'
import { coldStart } from './cold-start.js'

import '../../functions/.pikku/pikku-bootstrap.gen.js'

export const httpRoute = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  const result = await runFetch(singletonServices, createSessionServices, event)
  return result
}

export const myScheduledTask: ScheduledHandler = async () => {
  const singletonServices = await coldStart()
  await runScheduledTask({
    name: 'myScheduledTask',
    singletonServices,
  })
}

export const mySQSProcessor: SQSHandler = async (event) => {
  const singletonServices = await coldStart()
  await runSQSQueueMessage(singletonServices, createSessionServices, event)
}
