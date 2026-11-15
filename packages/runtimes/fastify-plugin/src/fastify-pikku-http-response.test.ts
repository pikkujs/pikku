import assert from 'node:assert/strict'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, test } from 'node:test'
import Fastify from 'fastify'

import { FastifyPikkuHTTPResponse } from './fastify-pikku-http-response.js'

const serve = async (
  onResponse: (response: FastifyPikkuHTTPResponse) => void
) => {
  const app = Fastify()
  app.get('/stream', (_request, reply) => {
    reply.hijack()
    const response = new FastifyPikkuHTTPResponse(reply)
    response.setMode('stream')
    response.header('Content-Type', 'text/event-stream')
    onResponse(response)
    response.flush()
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return { app, port: (app.server.address() as AddressInfo).port }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('FastifyPikkuHTTPResponse over a real socket', () => {
  test('a heartbeat is a comment frame the client receives', async () => {
    let response!: FastifyPikkuHTTPResponse
    const { app, port } = await serve((r) => (response = r))
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
    await app.close()
  })

  test('onClose fires once when the client disconnects', async () => {
    let closed = 0
    const { app, port } = await serve((r) => r.onClose(() => closed++))
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
    await app.close()
  })
})
