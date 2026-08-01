import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { describe, test } from 'node:test'

import { PikkuDuplexResponse } from './pikku-duplex-response.js'

const collect = () => {
  const socket = new PassThrough()
  const chunks: Buffer[] = []
  socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  return {
    socket,
    written: () => Buffer.concat(chunks).toString(),
  }
}

describe('PikkuDuplexResponse', () => {
  test('writes nothing for an upgrade that only set headers', () => {
    const { socket, written } = collect()
    const response = new PikkuDuplexResponse(socket)

    // What the middleware chain does on every request, including the ones
    // that go on to become a successful websocket handshake.
    response.header('Access-Control-Allow-Origin', '*')

    assert.equal(
      written(),
      '',
      'a header alone must not put bytes on the wire — `ws` writes the 101 ' +
        'status line, and anything before it corrupts the handshake'
    )
  })

  test('flushes a status line before the headers it buffered', () => {
    const { socket, written } = collect()
    const response = new PikkuDuplexResponse(socket)

    response.header('Access-Control-Allow-Origin', '*')
    response.status(404)
    response.json({ name: 'NotFoundError' })

    const raw = written()
    assert.ok(
      raw.startsWith('HTTP/1.1 404 Not Found\r\n'),
      `expected a status line first, got: ${JSON.stringify(raw.slice(0, 40))}`
    )
    assert.ok(raw.includes('Access-Control-Allow-Origin: *\r\n'))
    assert.ok(raw.endsWith('\r\n{"name":"NotFoundError"}'))
  })

  test('ending without a body still produces a valid response', () => {
    const { socket, written } = collect()
    const response = new PikkuDuplexResponse(socket)

    response.status(401)
    response.end()

    assert.equal(written(), 'HTTP/1.1 401 Unauthorized\r\n\r\n')
  })

  test('strips CR/LF from header values', () => {
    const { socket, written } = collect()
    const response = new PikkuDuplexResponse(socket)

    response.header('X-Test', 'a\r\nInjected: yes')
    response.end()

    assert.ok(written().includes('X-Test: aInjected: yes\r\n'))
  })
})
