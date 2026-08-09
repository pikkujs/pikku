import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { connect, type Socket } from 'node:net'
import { after, before, describe, test } from 'node:test'
import { WebSocketServer } from 'ws'
import {
  getSingletonServices,
  setSingletonServices,
} from '@pikku/core/ecosystem'

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
  let previousSingletons: unknown
  const unhandled: unknown[] = []
  const onUnhandled = (error: unknown) => unhandled.push(error)

  /** Resolves once the injected upgrade listener has fired the reset. */
  let resetEmitted: Promise<void>

  before(async () => {
    // Singleton services are process-global. Whatever was there is put back in
    // `after` so `silentLogger` does not follow this file into another suite
    // sharing the process. Nothing set is the normal case, and is not an error.
    try {
      previousSingletons = getSingletonServices()
    } catch {
      previousSingletons = undefined
    }
    setSingletonServices({ logger: silentLogger } as any)

    server = createServer()
    wss = new WebSocketServer({ noServer: true })
    pikkuWebsocketHandler({ server, wss, logger: silentLogger })

    // Registered after the handler's own listener, so it runs once the handler
    // has had its synchronous chance to claim the socket and has gone async
    // opening the channel. That is the window a real connection reset lands
    // in; reproducing it by actually resetting the connection would be a race.
    resetEmitted = new Promise<void>((resolve) => {
      server.on('upgrade', (_req, socket) => {
        socket.emit('error', new Error('read ECONNRESET'))
        resolve()
      })
    })

    port = await listen(server)

    // An unhandled 'error' on a raw socket is fatal to the process. The test
    // runner would report it against whichever test happened to be running, so
    // it is collected explicitly instead.
    process.on('uncaughtException', onUnhandled)
    process.on('unhandledRejection', onUnhandled)
  })

  after(async () => {
    process.off('uncaughtException', onUnhandled)
    process.off('unhandledRejection', onUnhandled)
    // Both close asynchronously — they wait out live connections — so the
    // teardown phase has to wait for them rather than just asking.
    await new Promise<void>((resolve) => wss.close(() => resolve()))
    await new Promise<void>((resolve) => server.close(() => resolve()))
    if (previousSingletons) {
      setSingletonServices(previousSingletons as any)
    }
  })

  test('a connection reset mid-handshake does not take the process down', async () => {
    const socket = await startUpgrade(port)

    // Waits on the reset itself. A fixed delay is not a synchronisation point:
    // if the upgrade ran late, an empty `unhandled` would only prove the error
    // path had not run yet.
    await resetEmitted
    // One turn of the loop, so an error escalating asynchronously out of the
    // handler has landed before the assertion reads the list.
    await new Promise((resolve) => setImmediate(resolve))
    socket.destroy()

    assert.deepEqual(
      unhandled,
      [],
      'the reset must be absorbed by the upgrade handler, not escalated'
    )
  })
})
