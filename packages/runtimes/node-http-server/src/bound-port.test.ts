import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'

import { PikkuNodeHTTPServer } from './pikku-node-http-server.js'

const silentLogger = {
  info: (_msg: string) => {},
  warn: (_msg: string) => {},
  error: (_msg: string | Error) => {},
  debug: (_msg: string) => {},
  setLevel: () => {},
}

const resetState = () => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    schema: {
      compileSchema: async () => {},
      getSchemaNames: () => new Set<string>(),
    },
  } as any)
}

const startServer = async (port: number) => {
  resetState()
  const server = new PikkuNodeHTTPServer(
    { port, hostname: '127.0.0.1' } as any,
    silentLogger as any
  )
  await server.init()
  await server.start()
  return server
}

describe('the bound port a caller can hand a parent process', () => {
  test('port 0 resolves to the port the OS actually handed out', async () => {
    const server = await startServer(0)
    try {
      assert.notEqual(
        server.port,
        0,
        'a requested port of 0 must not be reported back as 0'
      )
      assert.ok(server.port > 0 && server.port < 65536)
      const response = await fetch(`http://127.0.0.1:${server.port}/__nothing`)
      assert.ok(
        response.status > 0,
        'the reported port must be the one that is listening'
      )
      await response.arrayBuffer()
    } finally {
      await server.stop()
    }
  })

  test('an explicit port is reported unchanged', async () => {
    const first = await startServer(0)
    const chosen = first.port
    await first.stop()

    const server = await startServer(chosen)
    try {
      assert.equal(server.port, chosen)
    } finally {
      await server.stop()
    }
  })

  test('before listening it falls back to the requested port', async () => {
    resetState()
    const server = new PikkuNodeHTTPServer(
      { port: 4321, hostname: '127.0.0.1' } as any,
      silentLogger as any
    )
    assert.equal(server.port, 4321)
  })
})
