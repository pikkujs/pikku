import { PikkuFetchHTTPRequest, PikkuFetchHTTPResponse } from '@pikku/core/http'
import type { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda'
import { responseToLambdaResult } from '../response-converter.js'
import { runChannelConnect } from '@pikku/core/channel/serverless'
import { getServerlessDependencies } from './utils.js'
import type { WebsocketParams } from './websocket-types.js'
import { lambdaEventToRequest } from '../request-converter.js'

export const connectWebsocket = async (
  event: APIGatewayEvent,
  { channelStore }: WebsocketParams
): Promise<APIGatewayProxyResult> => {
  const runnerParams = getServerlessDependencies(channelStore, event)
  const request = new PikkuFetchHTTPRequest(lambdaEventToRequest(event))
  const response = new PikkuFetchHTTPResponse()
  await runChannelConnect({
    ...runnerParams,
    request,
    response,
    route: event.path || '/',
  })
  return responseToLambdaResult(response.toResponse())
}
