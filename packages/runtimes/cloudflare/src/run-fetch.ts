import {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '@pikku/core'
import { fetch } from '@pikku/core/http'
import { CloudflareWebSocketHibernationServer } from './cloudflare-hibernation-websocket-server.js'

export const runFetch = async <
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
>(
  request: Request,
  singletonServices: SingletonServices,
  createSessionServices: CreateSessionServices<
    SingletonServices,
    Services,
    UserSession
  >,
  websocketHibernationServer?: CloudflareWebSocketHibernationServer<SingletonServices>
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

  const response = await fetch(request, {
    singletonServices,
    createSessionServices: createSessionServices as any,
  })
  return response
}
