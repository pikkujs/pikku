import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'

import { assertPortFree, createReadyBarrier } from './spawn-dev-server.js'
import { SERVER_READY_MARKER, serverReadyLine } from './server-ready.js'

const listenOnFreePort = (): Promise<{
  port: number
  close: () => Promise<void>
}> =>
  new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })

test('a free port is accepted', async () => {
  const { port, close } = await listenOnFreePort()
  await close()
  await assertPortFree(port)
})

test('an occupied port is rejected by name', async () => {
  const { port, close } = await listenOnFreePort()
  try {
    await assert.rejects(
      () => assertPortFree(port),
      (error: Error) => error.message.includes(`Port ${port} is already in use`)
    )
  } finally {
    await close()
  }
})

test('the barrier resolves on the line the server actually prints', async () => {
  const barrier = createReadyBarrier('Server')
  barrier.observe(
    'pikku-node-http-server: listening on http://127.0.0.1:4077\n'
  )
  barrier.observe(`${serverReadyLine('localhost', 4077)}\n`)
  await barrier.wait({ timeoutMs: 200, pollMs: 1 })
})

test('the listening line alone is not readiness', async () => {
  const barrier = createReadyBarrier('Server')
  // `listening on …` is logged inside server.start(), BEFORE afterStart runs —
  // treating it as ready races whatever the project seeds there.
  barrier.observe(
    'pikku-node-http-server: listening on http://127.0.0.1:4077\n'
  )
  await assert.rejects(
    () => barrier.wait({ timeoutMs: 20, pollMs: 1 }),
    (error: Error) => error.message.includes('did not report ready')
  )
})

test('the marker is found even when it lands split across two chunks', async () => {
  const barrier = createReadyBarrier('Server')
  const line = serverReadyLine('localhost', 4077)
  const cut = line.indexOf(SERVER_READY_MARKER) + 5
  barrier.observe(line.slice(0, cut))
  await assert.rejects(() => barrier.wait({ timeoutMs: 20, pollMs: 1 }))
  barrier.observe(line.slice(cut))
  await barrier.wait({ timeoutMs: 200, pollMs: 1 })
})

test('it fails fast when the server dies, naming the exit code', async () => {
  const barrier = createReadyBarrier('Server')
  barrier.markExited(1)
  await assert.rejects(
    () => barrier.wait({ timeoutMs: 60_000, pollMs: 1 }),
    (error: Error) => error.message.includes('Server exited with code 1')
  )
})

test('a server that goes quiet times out rather than hanging', async () => {
  const barrier = createReadyBarrier('Server')
  await assert.rejects(
    () => barrier.wait({ timeoutMs: 20, pollMs: 1 }),
    (error: Error) => error.message.includes('did not report ready within')
  )
})
