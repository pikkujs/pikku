import assert from 'node:assert/strict'
import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, test } from 'node:test'
import express from 'express'

import { ExpressPikkuHTTPResponse } from './express-pikku-http-response.js'

const serve = async (
  onResponse: (response: ExpressPikkuHTTPResponse) => void
): Promise<{ server: Server; port: number }> => {
  const app = express()
  app.get('/stream', (_req, res) => {
    const response = new ExpressPikkuHTTPResponse(res)
    response.setMode('stream')
    response.header('Content-Type', 'text/event-stream')
    onResponse(response)
    response.flush()
  })
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  return { server, port: (server.address() as AddressInfo).port }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('ExpressPikkuHTTPResponse over a real socket', () => {
  test('a heartbeat is a comment frame the client receives', async () => {
    let response!: ExpressPikkuHTTPResponse
    const { server, port } = await serve((r) => (response = r))
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
    await opened
    response.heartbeat()
    response.arrayBuffer('hello')
    await sleep(50)
    assert.equal(chunks.join(''), ':\n\ndata: hello\n\n')
    req.destroy()
    server.closeAllConnections()
    server.close()
  })

  test('onClose fires once when the client disconnects', async () => {
    let closed = 0
    const { server, port } = await serve((r) => r.onClose(() => closed++))
    const req = request({ port, host: '127.0.0.1', path: '/stream' })
    const opened = new Promise<void>((resolve) =>
      req.on('response', () => resolve())
    )
    req.on('error', () => {})
    req.end()
    await opened
    assert.equal(closed, 0)
    req.destroy()
    await sleep(100)
    assert.equal(closed, 1)
    server.closeAllConnections()
    server.close()
  })
})
