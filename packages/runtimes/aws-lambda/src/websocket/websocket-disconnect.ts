import {
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from '@pikku/core'
import { runChannelDisconnect } from '@pikku/core/channel/serverless'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { getServerlessDependencies } from './utils.js'
import { WebsocketParams } from './websocket-types.js'

export const disconnectWebsocket = async <
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
  await runChannelDisconnect({
    ...runnerParams,
    singletonServices: singletonServices as any,
    createWireServices: createWireServices as any,
  })
  return { statusCode: 200, body: '' }
}
