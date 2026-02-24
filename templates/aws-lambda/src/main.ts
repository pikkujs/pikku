import { ScheduledHandler, SQSHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
import { runSQSQueueWorker } from '@pikku/lambda/queue'
import { coldStart } from './cold-start.js'

import '../../functions/.pikku/pikku-bootstrap.gen.js'

export const httpRoute = async (event: APIGatewayProxyEvent) => {
  await coldStart()
  const result = await runFetch(event)
  return result
}

export const myScheduledTask: ScheduledHandler = async () => {
  await coldStart()
  await runScheduledTask({
    name: 'myScheduledTask',
  })
}

export const mySQSWorker: SQSHandler = async (event) => {
  const { logger } = await coldStart()
  await runSQSQueueWorker(logger, event)
}
