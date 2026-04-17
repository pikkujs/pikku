import type { DurableObjectState, WebSocket } from '@cloudflare/workers-types'
import type { Channel } from '@pikku/core/channel'
import { ChannelStore } from '@pikku/core/channel'

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

  public async setPikkuUserId(
    channelId: string,
    pikkuUserId: string | null
  ): Promise<void> {
    const websocket = this.getWebsocket(channelId)
    const { openingData, channelName } = websocket.deserializeAttachment()
    websocket.serializeAttachment({
      openingData,
      channelName,
      pikkuUserId,
    })
  }

  public async getChannel(channelId: string) {
    const websocket = this.getWebsocket(channelId)
    const { channelName, openingData, pikkuUserId } =
      websocket.deserializeAttachment()
    return {
      channelId,
      channelName,
      openingData,
      pikkuUserId: pikkuUserId ?? undefined,
    }
  }

  private getWebsocket(channelId: string) {
    const [websocket] = this.ctx.getWebSockets(channelId)
    if (!websocket) {
      throw new Error('Websocket not found')
    }
    return websocket
  }
}
