import { fetch } from '@pikku/core/http'
import { CloudflareWebSocketHibernationServer } from './cloudflare-hibernation-websocket-server.js'

export const runFetch = async (
  request: Request,
  websocketHibernationServer?: CloudflareWebSocketHibernationServer
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

  const response = await fetch(request)
  return response
}
