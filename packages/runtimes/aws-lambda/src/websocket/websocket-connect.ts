import {
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
  PikkuFetchHTTPRequest,
  PikkuFetchHTTPResponse,
} from '@pikku/core'
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { responseToLambdaResult } from '../response-converter.js'
import { runChannelConnect } from '@pikku/core/channel/serverless'
import { getServerlessDependencies } from './utils.js'
import { WebsocketParams } from './websocket-types.js'
import { lambdaEventToRequest } from '../request-converter.js'

export const connectWebsocket = async <
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
>(
  event: APIGatewayEvent,
  {
    singletonServices,
    createSessionServices,
    channelStore,
  }: WebsocketParams<SingletonServices, Services, UserSession>
): Promise<APIGatewayProxyResult> => {
  const runnerParams = getServerlessDependencies(
    singletonServices.logger,
    channelStore,
    event
  )
  const request = new PikkuFetchHTTPRequest(lambdaEventToRequest(event))
  const response = new PikkuFetchHTTPResponse()
  await runChannelConnect({
    ...runnerParams,
    request,
    response,
    singletonServices: singletonServices as any,
    createSessionServices: createSessionServices as any,
    route: event.path || '/',
  })
  return responseToLambdaResult(response.toResponse())
}
