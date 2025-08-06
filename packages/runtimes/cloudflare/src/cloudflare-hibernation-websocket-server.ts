import {
  DurableObjectState,
  DurableObject,
  Request as CloudflareRequest,
  WebSocket,
} from '@cloudflare/workers-types'
import {
  runChannelConnect,
  runChannelDisconnect,
  runChannelMessage,
} from '@pikku/core/channel/serverless'
import { CloudflareWebsocketStore } from './cloudflare-channel-store.js'
import { createCloudflareChannelHandlerFactory } from './cloudflare-channel-handler-factory.js'
import { CloudflareEventHubService } from './cloudflare-eventhub-service.js'
import {
  CoreSingletonServices,
  PikkuFetchHTTPRequest,
  PikkuFetchHTTPResponse,
} from '@pikku/core'
import crypto from 'crypto'
export abstract class CloudflareWebSocketHibernationServer<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
> implements DurableObject
{
  private eventHub: CloudflareEventHubService<{}> | undefined
  private channelStore: CloudflareWebsocketStore

  constructor(
    protected ctx: DurableObjectState,
    protected env: Record<string, string | undefined>
  ) {
    this.channelStore = new CloudflareWebsocketStore(this.ctx)
  }

  public async fetch(cloudflareRequest: CloudflareRequest) {
    // @ts-ignore
    const webSocketPair = new WebSocketPair()
    const client: WebSocket = webSocketPair[0]
    const server: WebSocket = webSocketPair[1]

    const request = new PikkuFetchHTTPRequest(cloudflareRequest as any)
    const response = new PikkuFetchHTTPResponse()

    const channelId = crypto.randomUUID().toString()
    const params = await this.getAllParams(server)

    try {
      this.ctx.acceptWebSocket(server, [channelId])
      await runChannelConnect({
        ...params,
        channelId,
        channelObject: server,
        route: request,
        request,
        response,
        bubbleErrors: true,
      })
    } catch (e) {
      // Something went wrong, the cloudflare response will deal with it.
    }

    return response.toResponse({ webSocket: client }) as any
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const params = await this.getAllParams(ws)
    const channelId = this.ctx.getTags(ws)[0]!
    const result = await runChannelMessage(
      {
        ...params,
        channelId,
      },
      message
    )
    if (result) {
      // We don't send binary results
      ws.send(JSON.stringify(result))
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    const params = await this.getAllParams(ws)
    const channelId = this.ctx.getTags(ws)[0]!
    await runChannelDisconnect({
      ...params,
      channelId,
    })
    this.eventHub?.onChannelClosed(channelId)
  }

  private async getAllParams(websocket: WebSocket) {
    const params = await this.getParams()
    if (!this.eventHub) {
      this.eventHub = new CloudflareEventHubService(
        params.singletonServices.logger,
        this.ctx
      )
    }
    const channelHandlerFactory = createCloudflareChannelHandlerFactory(
      params.singletonServices.logger,
      this.channelStore,
      websocket
    )
    return {
      ...params,
      channelStore: this.channelStore,
      singletonServices: {
        ...params.singletonServices,
        eventHub: this.eventHub,
      },
      channelHandlerFactory,
    }
  }

  protected abstract getParams(): Promise<{
    singletonServices: SingletonServices
    createSessionServices?: any
  }>
}
