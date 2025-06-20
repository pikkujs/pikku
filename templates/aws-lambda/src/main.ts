import { ScheduledHandler, SQSHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'
import { runQueueJob } from '@pikku/core/queue'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
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

export const mySQSProcessor: SQSHandler = async () => {
  const singletonServices = await coldStart()
  await runQueueJob({
    singletonServices,
    job: {}, // Convert SQS message to job format
  } as any)
}
