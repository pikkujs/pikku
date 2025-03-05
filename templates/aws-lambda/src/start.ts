import { ScheduledHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'
import { APIGatewayProxyEvent } from 'aws-lambda'
import { corsHTTP, corslessHTTP } from '@pikku/lambda/http'
import { createSessionServices } from '../../functions/src/services.js'
import { coldStart } from './cold-start.js'

import '../../functions/.pikku/pikku-bootstrap.gen.js'

export const corslessHandler = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await corslessHTTP(event, singletonServices, createSessionServices)
}

export const corsHandler = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await corsHTTP(event, [], singletonServices, createSessionServices)
}

export const myScheduledTask: ScheduledHandler = async () => {
  const singletonServices = await coldStart()
  await runScheduledTask({
    name: 'myScheduledTask',
    singletonServices,
  })
}
