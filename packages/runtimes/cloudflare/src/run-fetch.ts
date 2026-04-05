import { fetch } from '@pikku/core/http'
import type { CloudflareWebSocketHibernationServer } from './cloudflare-hibernation-websocket-server.js'

export interface RunFetchOptions {
  exposeErrors?: boolean
}

export const runFetch = async (
  request: Request,
  websocketHibernationServer?: CloudflareWebSocketHibernationServer,
  options?: RunFetchOptions
) => {
  const isWebsocketUpgradeRequest =
    request.method === 'GET' && request.headers.get('Upgrade') === 'websocket'
  if (isWebsocketUpgradeRequest) {
    if (!websocketHibernationServer) {
      return new Response(null, {
        status: 426,
        statusText: 'Durable Object expected WebSocket server',
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    }
    return websocketHibernationServer.fetch(request as any)
  }

  // Use CF-Ray as traceId when available, otherwise core generates one
  const traceId = request.headers.get('cf-ray') ?? undefined

  const response = await fetch(request, {
    traceId,
    exposeErrors: options?.exposeErrors ?? false,
  })
  return response
}
