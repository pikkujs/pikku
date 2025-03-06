import {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '@pikku/core'
import { CloudflareHTTPRequest } from './cloudflare-http-request.js'
import { CloudfrontHTTPResponse } from './cloudflare-http-response.js'
import { runHTTPRoute } from '@pikku/core/http'
import type {
  Request,
  IncomingRequestCfProperties,
} from '@cloudflare/workers-types'
import { CloudflareWebSocketHibernationServer } from './cloudflare-hibernation-websocket-server.js'

export const runFetch = async <
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
>(
  cloudflareRequest: Request<unknown, IncomingRequestCfProperties<unknown>>,
  singletonServices: SingletonServices,
  createSessionServices: CreateSessionServices<
    SingletonServices,
    Services,
    UserSession
  >,
  websocketHibernationServer?: CloudflareWebSocketHibernationServer<SingletonServices>
) => {
  const request = new CloudflareHTTPRequest(cloudflareRequest)

  const isWebsocketUpgradeRequest =
    cloudflareRequest.method === 'GET' &&
    cloudflareRequest.headers.get('Upgrade') === 'websocket'
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
    return websocketHibernationServer.fetch(cloudflareRequest)
  }

  const response = new CloudfrontHTTPResponse()
  await runHTTPRoute({
    request,
    response,
    singletonServices,
    createSessionServices: createSessionServices as any,
    route: request.path,
    method: request.method,
  })
  return response.getCloudflareResponse()
}
