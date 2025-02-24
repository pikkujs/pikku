import { APIGatewayProxyEvent } from 'aws-lambda'
import { corsHTTP, corslessHTTP } from '@pikku/lambda/http'

import '../../functions/.pikku/pikku-schemas/register.gen'
import '../../functions/.pikku/pikku-routes.gen'
import { createSessionServices } from '../../functions/src/services.js'
import { coldStart } from './cold-start.js'

export const corslessHandler = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await corslessHTTP(event, singletonServices, createSessionServices)
}

export const corsHandler = async (event: APIGatewayProxyEvent) => {
  const singletonServices = await coldStart()
  return await corsHTTP(event, [], singletonServices, createSessionServices)
}
