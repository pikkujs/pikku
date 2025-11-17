import {
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from '@pikku/core'
import { PikkuFetchHTTPResponse } from '@pikku/core/http'
import { runChannelMessage } from '@pikku/core/channel/serverless'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { getServerlessDependencies } from './utils.js'
import { WebsocketParams } from './websocket-types.js'
import { responseToLambdaResult } from '../response-converter.js'

export const processWebsocketMessage = async <
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
>(
  event: APIGatewayProxyEvent,
  {
    singletonServices,
    createWireServices,
    channelStore,
  }: WebsocketParams<SingletonServices, Services, UserSession>
): Promise<APIGatewayProxyResult> => {
  const runnerParams = getServerlessDependencies(
    singletonServices.logger,
    channelStore,
    event
  )
  const response = new PikkuFetchHTTPResponse()
  try {
    const result = await runChannelMessage(
      {
        ...runnerParams,
        singletonServices: singletonServices as any,
        createWireServices: createWireServices as any,
      },
      event.body
    )
    if (result) {
      // TODO: Support non json
      response.json(result as any)
    }
  } catch (e) {
    // Error should have already been handled by fetch
    console.error(e)
  }
  return responseToLambdaResult(response.toResponse())
}
