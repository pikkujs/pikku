import { CoreUserSession } from '@pikku/core'
import {
  ChannelStore,
  PikkuAbstractChannelHandler,
  PikkuChannelHandlerFactory,
} from '@pikku/core/channel'
import { sendMessage } from './utils.js'
import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import { Logger } from '@pikku/core/services'

class LambdaChannelHandler<
  UserSession extends CoreUserSession = CoreUserSession,
  OpeningData = unknown,
  Out = unknown,
> extends PikkuAbstractChannelHandler<OpeningData, Out> {
  constructor(
    private logger: Logger,
    private callbackAPI: ApiGatewayManagementApiClient,
    channelId: string,
    channelName: string,
    openingData: OpeningData
  ) {
    super(channelId, channelName, openingData)
  }

  public async send(message: Out, isBinary?: boolean) {
    if (isBinary) {
      throw new Error('Binary data is not supported on serverless lambdas')
    }
    const data = JSON.stringify(message)
    await sendMessage(this.logger, this.callbackAPI, this.channelId, data)
  }
}

export const createLambdaChannelHandlerFactory = (
  logger: Logger,
  channelStore: ChannelStore,
  callbackAPI: ApiGatewayManagementApiClient
) => {
  const factory: PikkuChannelHandlerFactory = (
    channelId,
    channelName,
    openingData
  ) =>
    new LambdaChannelHandler(
      logger,
      callbackAPI,
      channelId,
      channelName,
      openingData
    )
  return factory
}
