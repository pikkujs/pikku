import { runChannelDisconnect } from '@pikku/core/channel/serverless'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { getServerlessDependencies } from './utils.js'
import type { WebsocketParams } from './websocket-types.js'

export const disconnectWebsocket = async (
  event: APIGatewayProxyEvent,
  { channelStore }: WebsocketParams
): Promise<APIGatewayProxyResult> => {
  const runnerParams = getServerlessDependencies(channelStore, event)
  await runChannelDisconnect(runnerParams)
  return { statusCode: 200, body: '' }
}
