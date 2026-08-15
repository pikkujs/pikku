import type { Server } from 'http'
import type { WebSocket, WebSocketServer } from 'ws'
import { getSingletonServices } from '@pikku/core/ecosystem'
import { logChannels } from '@pikku/core/ecosystem/channel'
import type { PikkuLocalChannelHandler } from '@pikku/core/ecosystem/channel/local'
import {
  LocalEventHubService,
  runLocalChannel,
} from '@pikku/core/ecosystem/channel/local'
import { compileAllSchemas } from '@pikku/core/ecosystem/schema'
import type { RunHTTPWiringOptions } from '@pikku/core/ecosystem/http'
import { PikkuFetchHTTPRequest } from '@pikku/core/ecosystem/http'
import type { Logger } from '@pikku/core/ecosystem/services'

import { PikkuDuplexResponse } from './pikku-duplex-response.js'
import crypto from 'crypto'
import { incomingMessageToRequestConvertor } from './incoming-message-to-request-convertor.js'

/**
 * Frame-size ceiling every Pikku-owned `WebSocketServer` is constructed with.
 *
 * `ws` defaults to 100MB, which lets one unauthenticated upgrade buffer a frame
 * far larger than any Pikku message needs. A server that accepts a bigger frame
 * than this should say so explicitly at its construction site.
 */
export const DEFAULT_WS_MAX_PAYLOAD = 1024 * 1024

/**
 * Options for configuring the `pikkuHandler`.
 */
export type PikkuWSHandlerOptions = {
  server: Server
  wss: WebSocketServer
  logger: Logger
  logRoutes?: boolean
  loadSchemas?: boolean
} & RunHTTPWiringOptions

const isSerializable = (data: any): boolean => {
  // Check if the data is any kind of Buffer-like object
  if (
    typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    data instanceof Uint8Array ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Uint32Array ||
    data instanceof Int32Array ||
    data instanceof Float32Array ||
    data instanceof Float64Array ||
    data instanceof DataView ||
    data instanceof SharedArrayBuffer ||
    (Array.isArray(data) && data.some((item) => item instanceof Buffer))
  ) {
    return false // Not serializable (binary or buffer-like)
  }

  // Allow primitive objects and objects that are not binary-like
  return true
}

/**
 * Creates a WebSocket handler for handling requests using the `@pikku/core` framework.
 *
 * @param options - The options to configure the handler.
 * @returns The WebSocket request handler function.
 */
export const pikkuWebsocketHandler = ({
  server,
  wss,
  logger,
  loadSchemas,
  logRoutes,
}: PikkuWSHandlerOptions) => {
  if (logRoutes) {
    logChannels(logger)
  }
  if (loadSchemas) {
    compileAllSchemas(logger)
  }

  let eventHub: LocalEventHubService
  try {
    const singletonServices = getSingletonServices()
    eventHub =
      singletonServices.eventHub instanceof LocalEventHubService
        ? singletonServices.eventHub
        : new LocalEventHubService()
  } catch {
    eventHub = new LocalEventHubService()
  }

  wss.on(
    'connection',
    (ws: WebSocket, channelHandler: PikkuLocalChannelHandler) => {
      eventHub.onChannelOpened(channelHandler)

      channelHandler.registerOnSend((data) => {
        if (isSerializable(data)) {
          ws.send(JSON.stringify(data))
        } else {
          ws.send(data as any)
        }
      })

      channelHandler.registerOnSendBinary((data) => {
        ws.send(data)
      })

      ws.on('message', async (message, isBinary) => {
        if (isBinary) {
          const result = await channelHandler.binaryMessage(
            new Uint8Array(
              message instanceof ArrayBuffer
                ? message
                : (message as Buffer).buffer.slice(
                    (message as Buffer).byteOffset,
                    (message as Buffer).byteOffset +
                      (message as Buffer).byteLength
                  )
            )
          )
          if (result) {
            channelHandler.sendBinary(result)
          }
        } else {
          const result = await channelHandler.message(message.toString())
          if (result) {
            channelHandler.send(result)
          }
        }
      })

      ws.on('close', () => {
        eventHub.onChannelClosed(channelHandler.channelId)
        channelHandler.close()
      })

      channelHandler.open()
    }
  )

  server.on('upgrade', async (req, socket, head) => {
    // Opening the channel is async, so a client can reset before the handshake
    // completes. Until `ws` takes the socket over nothing listens for its
    // errors, and an unhandled 'error' on a raw socket kills the process.
    socket.on('error', (error) => {
      logger.debug(`Websocket upgrade socket error: ${error.message}`)
    })

    // Handle WebSocket connection upgrade
    const request = new PikkuFetchHTTPRequest(
      incomingMessageToRequestConvertor(req)
    )
    const response = new PikkuDuplexResponse(socket)

    // Initialize the channel handler
    const channelHandler = await runLocalChannel({
      channelId: crypto.randomUUID().toString(),
      request,
      response,
    })

    if (!channelHandler) {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, channelHandler)
    })
  })
}
