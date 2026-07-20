import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'net'
import { assertPortFree } from './backend-port.js'

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
