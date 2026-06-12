import type {
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
import type { CoreSingletonServices } from '@pikku/core'
import { PikkuFetchHTTPRequest, PikkuFetchHTTPResponse } from '@pikku/core/http'
import crypto from 'crypto'
export abstract class CloudflareWebSocketHibernationServer<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
> implements DurableObject {
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
        route: request.path(),
        request,
        response,
        bubbleErrors: true,
      })
    } catch (e) {
      // A connect-time throw is either an expected permission/auth denial (a
      // legitimate handshake "no") or a real fault — a service not wired into
      // this DO, the DB unreachable, the channel not registered, or a bug in
      // onConnect. A mid-handshake WebSocket client can only be told "denied"
      // via close + a non-101 status, but the two cases must NOT be conflated
      // silently: discarding the error turns every fault into an opaque 403
      // with no trace. Log it so deploy/runtime faults are diagnosable.
      const detail = e instanceof Error ? (e.stack ?? e.message) : String(e)
      try {
        params.singletonServices.logger.error(
          `channel connect failed for route ${request.path()}: ${detail}`
        )
      } catch {
        // logger may be unavailable if service construction itself failed
      }
      server.close(1008, 'Unauthorized')
      // Body is intentionally generic — the fault detail is logged above, not
      // leaked to the (possibly unauthenticated) handshake client.
      return new Response('Forbidden', { status: 403 }) as any
    }

    return response.status(101).toResponse({ webSocket: client }) as any
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    console.log('websocket message received')
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
    createWireServices?: any
  }>
}
