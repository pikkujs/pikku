import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { answersOk, devFrontendFor, serveFrontend } from './pages-serve.js'
import { isolatedCompare, ownBackend } from './pages.js'
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
    await served.stop()
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

  test('isolated (a changeset worktree), it never uses what answers on the configured port: it starts its own on a free port', async () => {
    const other = await listen(200)
    // a dev server that listens on the port given by its last --port
    const script =
      "const a=process.argv;const p=+a[a.lastIndexOf('--port')+1];require('http').createServer((q,s)=>s.end('mine')).listen(p,'127.0.0.1');setInterval(()=>{},1000)"
    try {
      const served = await serveFrontend({
        frontend: frontend(other.port, [process.execPath, '-e', script, '--']),
        envFor: () => ({ ...process.env }),
        write: () => {},
        healthTimeoutMs: 15_000,
        isolate: true,
      })
      try {
        assert.equal(served.started, true)
        assert.notEqual(served.baseUrl, `http://localhost:${other.port}`)
        const body = await (await fetch(`${served.baseUrl}/`)).text()
        assert.equal(body, 'mine')
      } finally {
        await served.stop()
      }
    } finally {
      await close(other.server)
    }
  })

  test("isolated with a backend: this tree's backend on its own free port, the frontend proxied to it, both stopped as process groups", async () => {
    // what answers on the configured ports belongs to another checkout
    const otherApp = await listen(200)
    // the backend starts a grandchild that holds its port, as `pikku dev` does
    // with its runner: only a process-group stop takes that one down
    const grandchild =
      "const p=+process.argv[1];require('http').createServer((q,s)=>s.end('this tree api')).listen(p,'127.0.0.1');setInterval(()=>{},1000)"
    const backendScript = `const a=process.argv;const p=a[a.lastIndexOf('--port')+1];require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)},p],{stdio:'inherit'});setInterval(()=>{},1000)`
    // the frontend says where its API proxy points
    const frontendScript =
      "const a=process.argv;const p=+a[a.lastIndexOf('--port')+1];require('http').createServer((q,s)=>s.end(process.env.VITE_API_PROXY||'none')).listen(p,'127.0.0.1');setInterval(()=>{},1000)"
    try {
      const served = await serveFrontend({
        frontend: frontend(otherApp.port, [
          process.execPath,
          '-e',
          frontendScript,
          '--',
        ]),
        apiUrl: 'http://localhost:3000',
        envFor: () => ({ ...process.env, VITE_API_PROXY: 'http://other:1' }),
        write: () => {},
        healthTimeoutMs: 15_000,
        isolate: true,
        backend: {
          cwd: process.cwd(),
          command: [process.execPath, '-e', backendScript, '--'],
        },
      })
      let api = ''
      try {
        assert.equal(served.apiNote, null)
        api = await (await fetch(`${served.baseUrl}/`)).text()
        assert.match(api, /^http:\/\/localhost:\d+$/)
        assert.notEqual(api, 'http://localhost:3000')
        assert.equal(await (await fetch(`${api}/`)).text(), 'this tree api')
        assert.match(served.command ?? '', /this tree's backend/)
      } finally {
        await served.stop()
      }
      assert.equal(await answersOk(`${api}/`), false, 'backend group gone')
      assert.equal(
        await answersOk(`${served.baseUrl}/`),
        false,
        'frontend group gone'
      )
    } finally {
      await close(otherApp.server)
    }
  })

  test('isolated, a backend that does not come up: the frontend proxies to nothing (never another checkout), and the result says so', async () => {
    const otherApi = await listen(200)
    const frontendScript =
      "const a=process.argv;const p=+a[a.lastIndexOf('--port')+1];require('http').createServer((q,s)=>s.end(process.env.VITE_API_PROXY||'none')).listen(p,'127.0.0.1');setInterval(()=>{},1000)"
    try {
      const served = await serveFrontend({
        frontend: frontend(await freePort(), [
          process.execPath,
          '-e',
          frontendScript,
          '--',
        ]),
        apiUrl: `http://localhost:${otherApi.port}`,
        envFor: () => ({ ...process.env }),
        write: () => {},
        healthTimeoutMs: 15_000,
        isolate: true,
        backend: {
          cwd: process.cwd(),
          command: [
            process.execPath,
            '-e',
            "console.error('no .pikku'); process.exit(1)",
            '--',
          ],
        },
      })
      try {
        const api = await (await fetch(`${served.baseUrl}/`)).text()
        assert.notEqual(api, `http://localhost:${otherApi.port}`)
        assert.match(
          served.apiNote ?? '',
          /backend did not start[\s\S]*without their data[\s\S]*no \.pikku/
        )
      } finally {
        await served.stop()
      }
    } finally {
      await close(otherApi.server)
    }
  })

  test('isolated with no backend in the config: the old behaviour, said in the result', async () => {
    const script =
      "const a=process.argv;const p=+a[a.lastIndexOf('--port')+1];require('http').createServer((q,s)=>s.end('x')).listen(p,'127.0.0.1');setInterval(()=>{},1000)"
    const served = await serveFrontend({
      frontend: frontend(await freePort(), [
        process.execPath,
        '-e',
        script,
        '--',
      ]),
      apiUrl: 'http://localhost:3000',
      envFor: () => ({ ...process.env }),
      write: () => {},
      healthTimeoutMs: 15_000,
      isolate: true,
      backend: null,
    })
    try {
      assert.match(
        served.apiNote ?? '',
        /backend was not started \(no backends[\s\S]*http:\/\/localhost:3000/
      )
    } finally {
      await served.stop()
    }
  })
})

describe('isolatedCompare / ownBackend', () => {
  test('only a parallel loop (PIKKU_CHANGES_PARALLEL=1) isolates, and only in a linked worktree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-isolate-'))
    const main = join(dir, 'main')
    const sh = (args: string[], cwd: string) =>
      execFileSync('git', args, { cwd, stdio: 'pipe' })
    mkdirSync(main)
    sh(['init', '-q'], main)
    sh(
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'x',
      ],
      main
    )
    sh(['worktree', 'add', '-q', join(dir, 'wt'), '-b', 'changeset/x'], main)
    const parallel = { PIKKU_CHANGES_PARALLEL: '1' }
    try {
      assert.equal(await isolatedCompare(join(dir, 'wt'), parallel), true)
      assert.equal(await isolatedCompare(join(dir, 'wt'), {}), false)
      assert.equal(
        await isolatedCompare(join(dir, 'wt'), { PIKKU_CHANGES_BUILDER: '1' }),
        false
      )
      assert.equal(await isolatedCompare(main, parallel), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the backend command: pikku dev --serveOnly from the config dir; the first backend named when there are several; none without backends', () => {
    const one = ownBackend(
      { configDir: '/p/fn', rootDir: '/p/fn', backends: { api: {} } },
      '/bin/pikku.js'
    )
    assert.equal(one?.cwd, '/p/fn')
    assert.deepEqual(one?.command.slice(1), [
      '/bin/pikku.js',
      'dev',
      '--serveOnly',
      '--no-watch',
      '--no-frontends',
      '--no-hmr',
    ])
    const two = ownBackend(
      { rootDir: '/p', backends: { api: {}, admin: {} } },
      '/bin/pikku.js'
    )
    assert.deepEqual(two?.command.slice(2, 5), ['dev', '--backend', 'api'])
    assert.equal(ownBackend({ rootDir: '/p' }, '/bin/pikku.js'), null)
  })
})
