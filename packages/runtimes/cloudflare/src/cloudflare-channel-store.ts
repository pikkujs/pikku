import { DurableObjectState, WebSocket } from '@cloudflare/workers-types'
import { Channel, ChannelStore } from '@pikku/core/channel'

export class CloudflareWebsocketStore extends ChannelStore {
  constructor(private ctx: DurableObjectState) {
    super()
  }

  public async addChannel({
    channelName,
    channelObject,
    openingData,
  }: Channel<WebSocket>): Promise<void> {
    if (!channelObject) {
      throw new Error('Channel object is required for cloudflare')
    }
    // The channel id is added when we accept the websocket connection
    channelObject?.serializeAttachment({ channelName, openingData })
  }

  public async removeChannels(channelIds: string[]): Promise<void> {
    // This is done by the durable object itself
  }

  public async setUserSession(
    channelId: string,
    userSession: any
  ): Promise<void> {
    const websocket = this.getWebsocket(channelId)
    const { openingData, channelName } = websocket.deserializeAttachment()
    websocket.serializeAttachment({
      openingData,
      channelName,
      userSession,
    })
  }

  public async getUserSession(channelId: string): Promise<any> {
    const websocket = this.getWebsocket(channelId)
    const { userSession } = websocket.deserializeAttachment()
    return userSession
  }

  public async getChannelAndSession(channelId: string) {
    const websocket = this.getWebsocket(channelId)
    return websocket.deserializeAttachment()
  }

  private getWebsocket(channelId: string) {
    const [websocket] = this.ctx.getWebSockets(channelId)
    if (!websocket) {
      throw new Error('Websocket not found')
    }
    return websocket
  }
}
