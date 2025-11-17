import * as uWS from 'uWebSockets.js'
import { logChannels } from '@pikku/core/channel'
import {
  runLocalChannel,
  PikkuLocalChannelHandler,
} from '@pikku/core/channel/local'
import { compileAllSchemas } from '@pikku/core/schema'

import { uwsToRequest } from './uws-request-convertor.js'
import { PikkuuWSHandlerOptions } from './pikku-uws-http-handler.js'
import { UWSEventHubService } from './uws-event-hub-service.js'
import { PikkuFetchHTTPRequest, PikkuFetchHTTPResponse } from '@pikku/core/http'

const isSerializable = (data: any): boolean => {
  return !(
    typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    data instanceof Uint8Array ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Uint32Array ||
    data instanceof Int32Array ||
    data instanceof Float32Array ||
    data instanceof Float64Array
  )
}

/**
 * Creates a uWebSockets handler for handling requests using the `@pikku/core` framework.
 *
 * @param {PikkuuWSHandlerOptions} options - The options to configure the handler.
 * @returns {Function} - The request handler function.
 */
export const pikkuWebsocketHandler = ({
  singletonServices,
  createInteractionServices,
  loadSchemas,
  logRoutes,
}: PikkuuWSHandlerOptions) => {
  if (logRoutes) {
    logChannels(singletonServices.logger)
  }
  if (loadSchemas) {
    compileAllSchemas(singletonServices.logger, singletonServices.schema)
  }

  const eventHub = new UWSEventHubService()
  const singletonServicesWithEventHub = {
    ...singletonServices,
    eventHub,
  }

  const decoder = new TextDecoder('utf-8')

  return {
    upgrade: async (res, req, context) => {
      /* Keep track of abortions */
      const upgradeAborted = { aborted: false }

      res.onAborted(() => {
        upgradeAborted.aborted = true
      })

      try {
        /* You MUST copy data out of req here, as req is only valid within this immediate callback */
        const url = req.getUrl()
        const secWebSocketKey = req.getHeader('sec-websocket-key')
        const secWebSocketProtocol = req.getHeader('sec-websocket-protocol')
        const secWebSocketExtensions = req.getHeader('sec-websocket-extensions')

        const request = new PikkuFetchHTTPRequest(await uwsToRequest(req, res))
        const response = new PikkuFetchHTTPResponse()

        const channelHandler = await runLocalChannel({
          channelId: crypto.randomUUID().toString(),
          request,
          response,
          singletonServices: singletonServicesWithEventHub,
          createInteractionServices,
          route: req.getUrl() as string,
        })

        if (upgradeAborted.aborted) {
          return
        }

        if (!channelHandler) {
          // Not authenticated / channel setup didn't go through
          return
        }

        res.cork(() => {
          res.upgrade(
            { url, channelHandler },
            secWebSocketKey,
            secWebSocketProtocol,
            secWebSocketExtensions,
            context
          )
        })
      } catch (e: any) {
        // Error should have already been handled by fetch
      }
    },
    open: (ws) => {
      const { channelHandler } = ws.getUserData()
      channelHandler.registerOnSend((data) => {
        if (isSerializable(data)) {
          ws.send(JSON.stringify(data))
        } else {
          ws.send(data as any)
        }
      })
      eventHub.onChannelOpened(channelHandler.channelId, ws)
      channelHandler.open()
    },
    message: async (ws, message, isBinary) => {
      const { channelHandler } = ws.getUserData()
      const data = isBinary ? message : decoder.decode(message)
      const result = await channelHandler.message(data)
      if (result) {
        // TODO: This doesn't deal with binary results
        ws.send(JSON.stringify(result))
      }
    },
    close: (ws) => {
      const { channelHandler } = ws.getUserData()
      eventHub.onChannelClosed(channelHandler.channelId)
      channelHandler.close()
    },
  } as uWS.WebSocketBehavior<{ channelHandler: PikkuLocalChannelHandler }>
}
