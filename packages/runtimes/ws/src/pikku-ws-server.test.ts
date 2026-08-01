import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { connect, type Socket } from 'node:net'
import { after, before, describe, test } from 'node:test'
import { WebSocketServer } from 'ws'
import { setSingletonServices } from '@pikku/core'

import { pikkuWebsocketHandler } from './pikku-ws-server.js'

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setLevel: () => {},
} as any

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as { port: number }).port)
    })
  })

/**
 * Opens a raw connection and writes a websocket upgrade request, without
 * waiting for the response — so the caller can drop it mid-handshake.
 */
const startUpgrade = (port: number): Promise<Socket> =>
  new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(
        'GET /ws HTTP/1.1\r\n' +
          `Host: 127.0.0.1:${port}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          '\r\n'
      )
      resolve(socket)
    })
  })

describe('pikkuWebsocketHandler upgrade', () => {
  let server: Server
  let wss: WebSocketServer
  let port: number
  const unhandled: unknown[] = []
  const onUnhandled = (error: unknown) => unhandled.push(error)

  before(async () => {
    setSingletonServices({ logger: silentLogger } as any)

    server = createServer()
    wss = new WebSocketServer({ noServer: true })
    pikkuWebsocketHandler({ server, wss, logger: silentLogger })

    // Registered after the handler's own listener, so it runs once the handler
    // has had its synchronous chance to claim the socket and has gone async
    // opening the channel. That is the window a real connection reset lands
    // in; reproducing it by actually resetting the connection would be a race.
    server.on('upgrade', (_req, socket) => {
      socket.emit('error', new Error('read ECONNRESET'))
    })

    port = await listen(server)

    // An unhandled 'error' on a raw socket is fatal to the process. The test
    // runner would report it against whichever test happened to be running, so
    // it is collected explicitly instead.
    process.on('uncaughtException', onUnhandled)
    process.on('unhandledRejection', onUnhandled)
  })

  after(() => {
    process.off('uncaughtException', onUnhandled)
    process.off('unhandledRejection', onUnhandled)
    wss.close()
    server.close()
  })

  test('a connection reset mid-handshake does not take the process down', async () => {
    const socket = await startUpgrade(port)

    await new Promise((resolve) => setTimeout(resolve, 250))
    socket.destroy()

    assert.deepEqual(
      unhandled,
      [],
      'the reset must be absorbed by the upgrade handler, not escalated'
    )
  })
})
