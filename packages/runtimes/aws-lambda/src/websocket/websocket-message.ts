import { PikkuFetchHTTPResponse } from '@pikku/core/http'
import { runChannelMessage } from '@pikku/core/channel/serverless'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { getServerlessDependencies } from './utils.js'
import { WebsocketParams } from './websocket-types.js'
import { responseToLambdaResult } from '../response-converter.js'

export const processWebsocketMessage = async (
  event: APIGatewayProxyEvent,
  { channelStore }: WebsocketParams
): Promise<APIGatewayProxyResult> => {
  const runnerParams = getServerlessDependencies(channelStore, event)
  const response = new PikkuFetchHTTPResponse()
  try {
    const result = await runChannelMessage(runnerParams, event.body)
    if (result) {
      response.json(result as any)
    }
  } catch (e) {
    console.error(e)
  }
  return responseToLambdaResult(response.toResponse())
}
