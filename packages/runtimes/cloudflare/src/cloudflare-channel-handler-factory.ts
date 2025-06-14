import { CoreUserSession, isSerializable } from '@pikku/core'
import {
  ChannelStore,
  PikkuAbstractChannelHandler,
  PikkuChannelHandlerFactory,
} from '@pikku/core/channel'
import { Logger } from '@pikku/core/services'
import { WebSocket } from '@cloudflare/workers-types'
class CloudflareChannelHandler<
  UserSession extends CoreUserSession = CoreUserSession,
  OpeningData = unknown,
  Out = unknown,
> extends PikkuAbstractChannelHandler<OpeningData, Out> {
  constructor(
    channelId: string,
    channelName: string,
    openingData: OpeningData,
    private websocket: WebSocket,
    _logger: Logger
  ) {
    super(channelId, channelName, openingData)
  }

  public async send(message: Out, isBinary?: boolean) {
    if (isBinary) {
      throw new Error('Binary data is not supported on serverless')
    }
    if (isSerializable(message)) {
      this.websocket.send(JSON.stringify(message))
    } else {
      this.websocket.send(message as any)
    }
  }
}

export const createCloudflareChannelHandlerFactory = (
  logger: Logger,
  channelStore: ChannelStore,
  websocket: WebSocket
) => {
  const factory: PikkuChannelHandlerFactory = (
    channelId,
    channelName,
    openingData
  ) =>
    new CloudflareChannelHandler(
      channelId,
      channelName,
      openingData,
      websocket,
      logger
    )
  return factory
}
