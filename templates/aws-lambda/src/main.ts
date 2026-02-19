import { ScheduledHandler, SQSHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'
import { createRunFunction } from '@pikku/core/function'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
import { runSQSQueueWorker } from '@pikku/lambda/queue'
import { createWireServices } from '../../functions/src/services.js'
import { coldStart } from './cold-start.js'

import '../../functions/.pikku/pikku-bootstrap.gen.js'

export const httpRoute = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  const result = await runFetch(singletonServices, createWireServices, event)
  return result
}

export const myScheduledTask: ScheduledHandler = async () => {
  const singletonServices = await coldStart()
  const runFunction = createRunFunction({
    singletonServices,
    createWireServices,
  })
  await runScheduledTask({
    name: 'myScheduledTask',
    runFunction,
    logger: singletonServices.logger,
  })
}

export const mySQSWorker: SQSHandler = async (event) => {
  const singletonServices = await coldStart()
  await runSQSQueueWorker(singletonServices, createWireServices, event)
}
