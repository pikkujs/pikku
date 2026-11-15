import assert from 'node:assert/strict'
import { request } from 'node:http'
import { describe, test } from 'node:test'
import type uWSType from 'uWebSockets.js'

import { UWSPikkuHTTPResponse } from './uws-pikku-http-response.js'

// uWebSockets.js is a native module that loads on Node only (not under Bun),
// so these real-socket tests skip where it cannot load.
const uWS: typeof uWSType | undefined = await import('uWebSockets.js')
  .then((m) => m.default ?? (m as any))
  .catch(() => undefined)

const serve = async (
  onResponse: (response: UWSPikkuHTTPResponse) => void
): Promise<{ port: number; close: () => void }> => {
  const app = uWS!.App()
  app.get('/stream', (res) => {
    let aborted = false
    const listeners: Array<() => void> = []
    res.onAborted(() => {
      aborted = true
      for (const listener of listeners) listener()
    })
    const response = new UWSPikkuHTTPResponse(
      res,
      () => aborted,
      (listener) => listeners.push(listener)
    )
    response.setMode('stream')
    response.header('Content-Type', 'text/event-stream')
    onResponse(response)
    response.flushHeaders()
  })
  const port = 40000 + Math.floor(Math.random() * 20000)
  const socket = await new Promise<uWSType.us_listen_socket>(
    (resolve, reject) =>
      app.listen('127.0.0.1', port, (s) =>
        s ? resolve(s) : reject(new Error('uWS could not listen'))
      )
  )
  return { port, close: () => uWS!.us_listen_socket_close(socket) }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('UWSPikkuHTTPResponse over a real socket', { skip: !uWS }, () => {
  test('a heartbeat is a comment frame the client receives', async () => {
    let response!: UWSPikkuHTTPResponse
    const { port, close } = await serve((r) => (response = r))
    const chunks: string[] = []
    const req = request({ port, host: '127.0.0.1', path: '/stream' })
    const opened = new Promise<void>((resolve) => {
      req.on('response', (res) => {
        res.setEncoding('utf8')
        res.on('data', (chunk) => chunks.push(chunk))
        resolve()
      })
    })
    req.end()
    await sleep(50)
    response.heartbeat()
    response.arrayBuffer('hello')
    await opened
    await sleep(50)
    assert.equal(chunks.join(''), ':\n\ndata: hello\n\n')
    req.destroy()
    close()
  })

  test('onClose fires once when the client disconnects', async () => {
    let closed = 0
    const { port, close } = await serve((r) => r.onClose(() => closed++))
    const req = request({ port, host: '127.0.0.1', path: '/stream' })
    req.on('error', () => {})
    req.on('response', () => {})
    req.end()
    await sleep(100)
    assert.equal(closed, 0)
    req.destroy()
    await sleep(150)
    assert.equal(closed, 1)
    close()
  })

  test('onClose fires when the server closes the stream', async () => {
    let closed = 0
    let response!: UWSPikkuHTTPResponse
    const { port, close } = await serve((r) => {
      response = r
      r.onClose(() => closed++)
    })
    const req = request({ port, host: '127.0.0.1', path: '/stream' })
    req.on('error', () => {})
    req.on('response', (res) => res.resume())
    req.end()
    await sleep(100)
    response.close()
    await sleep(50)
    assert.equal(closed, 1)
    req.destroy()
    close()
  })
})
