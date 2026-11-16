import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { answersOk, devFrontendFor, serveFrontend } from './pages-serve.js'
import type { DevFrontend } from './dev-frontends.js'

const listen = (status: number): Promise<{ server: Server; port: number }> =>
  new Promise((resolve) => {
    const server = createServer((_q, s) => {
      s.statusCode = status
      s.end('ok')
    })
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as AddressInfo).port })
    )
  })

const close = (server: Server) =>
  new Promise((r) => {
    server.closeAllConnections()
    server.close(r)
  })

const freePort = async () => {
  const { server, port } = await listen(200)
  await close(server)
  return port
}

const frontend = (port: number, command: string[]): DevFrontend => ({
  name: 'app',
  cwd: process.cwd(),
  command,
  port,
  healthPath: '/',
  primary: true,
})

const serverScript = (port: number) =>
  `require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1');setInterval(()=>{},1000)`

const noSpawn = (() => {
  throw new Error('spawned')
}) as never

describe('devFrontendFor', () => {
  test('finds the frontend by its directory, among those with a dev command', () => {
    const frontends = {
      app: {
        cwd: '/r/apps/app',
        dist: '/r/apps/app/dist',
        dev: { command: ['bun', 'run', 'dev'], port: 7104, healthPath: '/' },
      },
      docs: { cwd: '/r/apps/docs', dist: '/r/apps/docs/dist' },
    }
    assert.equal(devFrontendFor(frontends, '/r/apps/app/')?.port, 7104)
    assert.equal(devFrontendFor(frontends, '/r/apps/docs'), null)
    assert.equal(devFrontendFor(undefined, '/r/apps/app'), null)
  })
})

describe('answersOk', () => {
  test('a 200 answers, a 404 or nothing listening does not', async () => {
    const ok = await listen(200)
    const missing = await listen(404)
    try {
      assert.equal(await answersOk(`http://127.0.0.1:${ok.port}/`), true)
      assert.equal(await answersOk(`http://127.0.0.1:${missing.port}/`), false)
      assert.equal(
        await answersOk(`http://127.0.0.1:${await freePort()}/`),
        false
      )
    } finally {
      await close(ok.server)
      await close(missing.server)
    }
  })
})

describe('serveFrontend', () => {
  test('uses a dev server that already answers, and starts nothing', async () => {
    const running = await listen(200)
    const api = await listen(404)
    try {
      const served = await serveFrontend({
        frontend: frontend(running.port, ['false']),
        apiUrl: `http://localhost:${api.port}`,
        envFor: () => ({ ...process.env }),
        spawnImpl: noSpawn,
      })
      assert.equal(served.started, false)
      assert.equal(served.baseUrl, `http://localhost:${running.port}`)
      assert.equal(served.apiNote, null)
    } finally {
      await close(running.server)
      await close(api.server)
    }
  })

  test('starts the dev command when nothing answers, and stops only that', async () => {
    const port = await freePort()
    const lines: string[] = []
    const served = await serveFrontend({
      frontend: frontend(port, [process.execPath, '-e', serverScript(port)]),
      apiUrl: `http://localhost:${await freePort()}`,
      envFor: () => ({ ...process.env }),
      write: (l) => lines.push(l),
      healthTimeoutMs: 15_000,
    })
    assert.equal(served.started, true)
    assert.match(lines[0]!, /^Starting app \(.+\) on port \d+ for the compare/)
    assert.match(
      served.apiNote ?? '',
      /did not answer, so pages that load data/
    )
    assert.equal(await answersOk(`${served.baseUrl}/`), true)
    served.stop()
    for (let i = 0; i < 40 && (await answersOk(`${served.baseUrl}/`)); i++)
      await new Promise((r) => setTimeout(r, 50))
    assert.equal(await answersOk(`${served.baseUrl}/`), false)
  })

  test('a dev command that dies says so and points at --baseUrl', async () => {
    const port = await freePort()
    await assert.rejects(
      serveFrontend({
        frontend: frontend(port, [
          process.execPath,
          '-e',
          "console.error('boom'); process.exit(3)",
        ]),
        envFor: () => ({ ...process.env }),
        write: () => {},
        healthTimeoutMs: 15_000,
      }),
      /Could not start app for the compare[\s\S]*boom[\s\S]*pass --baseUrl/
    )
  })
})
