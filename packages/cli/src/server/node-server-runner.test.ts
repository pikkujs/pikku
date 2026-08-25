import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'

import { NodeServerRunner } from './node-server-runner.js'
import { SERVER_READY_MARKER, serverReadyLine } from './server-ready.js'

const silentLogger = {
  info: (_msg: string) => {},
  warn: (_msg: string) => {},
  error: (_msg: string | Error) => {},
  debug: (_msg: string) => {},
  setLevel: () => {},
}

const startRunner = async (port: number) => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    schema: {
      compileSchema: async () => {},
      getSchemaNames: () => new Set<string>(),
    },
  } as any)

  const runner = new NodeServerRunner(process.cwd())
  await runner.createEventHub()
  const server = runner.createServer(
    { port, hostname: '127.0.0.1' } as any,
    silentLogger as any
  )
  await server.init()
  await server.start()
  return server
}

describe('the port a dev server reports back to whoever spawned it', () => {
  test('a runner asked for port 0 reports the port it actually bound', async () => {
    const server = await startRunner(0)
    try {
      assert.notEqual(server.port, 0)
      assert.ok(server.port > 0 && server.port < 65536)
    } finally {
      await server.stop()
    }
  })

  test('the ready line built from it names a port a parent can connect to', async () => {
    const server = await startRunner(0)
    try {
      const line = serverReadyLine('127.0.0.1', server.port)
      assert.ok(line.startsWith(SERVER_READY_MARKER))
      assert.equal(
        line,
        `${SERVER_READY_MARKER} on http://127.0.0.1:${server.port}`
      )
      assert.ok(
        !line.endsWith(':0'),
        'a `--port 0` server must never announce itself on :0'
      )

      const response = await fetch(
        line.slice(line.indexOf('http://')) + '/__nothing'
      )
      await response.arrayBuffer()
      assert.ok(response.status > 0)
    } finally {
      await server.stop()
    }
  })
})
