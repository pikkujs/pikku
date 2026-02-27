import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import type { Logger } from '@pikku/core/services'
import { getSingletonServices } from '@pikku/core'
import type { APIGatewayEvent } from 'aws-lambda'
import { createLambdaChannelHandlerFactory } from './lambda-channel-handler.js'
import type { ChannelStore } from '@pikku/core/channel'

export const sendMessage = async (
  logger: Logger,
  callbackAPI: ApiGatewayManagementApiClient,
  ConnectionId: string,
  Data: string
): Promise<boolean> => {
  try {
    await callbackAPI.send(new PostToConnectionCommand({ ConnectionId, Data }))
    return true
  } catch (e: any) {
    // TODO: We need to check if it's a 410 and remove the connection if it is
    // Otherwise we need to log the error
    logger.error(e.message)
    return false
  }
}

export const sendMessages = async (
  logger: Logger,
  channelStore: ChannelStore,
  callbackAPI: ApiGatewayManagementApiClient,
  fromChannelId: string,
  channelIds: string[],
  data: unknown,
  isBinary?: boolean
): Promise<void> => {
  if (isBinary) {
    throw new Error('Binary data is not supported on serverless lambdas')
  }
  const staleWebsockets: string[] = []
  const Data = JSON.stringify(data)
  await Promise.all(
    channelIds.map(async (channelId) => {
      if (channelId !== fromChannelId) {
        const success = await sendMessage(logger, callbackAPI, channelId, Data)
        if (!success) {
          staleWebsockets.push(channelId)
        }
      }
    })
  )
  if (staleWebsockets.length > 0) {
    await channelStore.removeChannels(staleWebsockets)
  }
}

export const getApiGatewayManagementApiClient = (
  logger: Logger,
  event: APIGatewayEvent
) => {
  let endpoint: string
  if (process.env.IS_OFFLINE) {
    logger.info('Assuming serverless offline mode due to IS_OFFLINE')
    endpoint = `http://localhost:3001`
  } else if (event.requestContext.domainName?.includes('amazonaws.com')) {
    logger.info(
      'Assuming we are using the default endpoint mode due to amazonaws.com domain'
    )
    endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`
  } else {
    logger.info('Assuming we are using a custom domain mode')
    endpoint = `https://${event.requestContext.domainName}`
  }
  return new ApiGatewayManagementApiClient({
    apiVersion: '2018-11-29',
    endpoint,
  })
}

export const getServerlessDependencies = (
  channelStore: ChannelStore,
  event: APIGatewayEvent
) => {
  const { logger } = getSingletonServices()
  const channelId = event.requestContext.connectionId
  if (!channelId) {
    throw new Error('No connectionId found in requestContext')
  }
  const callbackAPI = getApiGatewayManagementApiClient(logger, event)
  const channelHandlerFactory = createLambdaChannelHandlerFactory(
    logger,
    channelStore,
    callbackAPI
  )
  return { channelId, callbackAPI, channelHandlerFactory, channelStore }
}
