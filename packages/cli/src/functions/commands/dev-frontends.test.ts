import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  createLinePrefixer,
  parseFrontendNames,
  selectDevFrontends,
  startDevFrontends,
  waitForHealth,
} from './dev-frontends.js'

const frontends = {
  admin: {
    cwd: '/r/admin',
    dist: '/r/admin/dist',
    dev: { command: ['bun', 'run', 'dev'], port: 7105, healthPath: '/' },
  },
  app: {
    cwd: '/r/app',
    dist: '/r/app/dist',
    primary: true,
    dev: { command: ['bun', 'run', 'dev'], port: 7104, healthPath: '/' },
  },
  docs: { cwd: '/r/docs', dist: '/r/docs/dist' },
}

describe('selectDevFrontends', () => {
  test('keeps every frontend with a dev command, primary first, skipping the rest', () => {
    assert.deepEqual(
      selectDevFrontends(frontends).map((f) => f.name),
      ['app', 'admin']
    )
  })
  test('--frontend narrows the set', () => {
    assert.deepEqual(
      selectDevFrontends(frontends, ['admin']).map((f) => f.name),
      ['admin']
    )
  })
  test('an unknown or command-less frontend is an error naming it', () => {
    assert.throws(
      () => selectDevFrontends(frontends, ['nope']),
      /nope.*no such/
    )
    assert.throws(
      () => selectDevFrontends(frontends, ['docs']),
      /docs.*dev\.command/
    )
  })
  test('no frontends declared means none to run', () => {
    assert.deepEqual(selectDevFrontends(undefined), [])
  })
})

describe('parseFrontendNames', () => {
  test('splits commas, trims, and treats empty as unset', () => {
    assert.deepEqual(parseFrontendNames('a, b,,c'), ['a', 'b', 'c'])
    assert.equal(parseFrontendNames(''), undefined)
    assert.equal(parseFrontendNames(undefined), undefined)
  })
})

describe('createLinePrefixer', () => {
  test('prefixes whole lines and holds a partial one across chunks', () => {
    const lines: string[] = []
    const p = createLinePrefixer('[a] ', (l) => lines.push(l))
    p.push('one\ntw')
    p.push('o\nthr')
    p.flush()
    assert.deepEqual(lines, ['[a] one', '[a] two', '[a] thr'])
  })
})

const listen = (status: number) =>
  new Promise<{ server: Server; port: number }>((resolve) => {
    const server = createServer((_req, res) => {
      res.statusCode = status
      res.end('x')
    }).listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as AddressInfo).port })
    )
  })

describe('waitForHealth', () => {
  test('resolves when the server answers, even with a redirect', async () => {
    const { server, port } = await listen(302)
    try {
      await waitForHealth(`http://127.0.0.1:${port}/`, {
        aborted: () => false,
        pollMs: 10,
      })
    } finally {
      server.close()
    }
  })
  test('keeps waiting through a 500 and times out', async () => {
    const { server, port } = await listen(500)
    try {
      await assert.rejects(
        waitForHealth(`http://127.0.0.1:${port}/`, {
          aborted: () => false,
          timeoutMs: 100,
          pollMs: 10,
        }),
        /did not answer/
      )
    } finally {
      server.close()
    }
  })
})

const freePort = async () => {
  const { server, port } = await listen(200)
  await new Promise((r) => server.close(r))
  return port
}

describe('startDevFrontends (real processes)', () => {
  const serverScript = (port: number) =>
    `require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1',()=>console.log('up ${port}'));setInterval(()=>{},1000)`

  test('runs two frontends, prefixes output, passes env, and stops them', async () => {
    const [p1, p2] = [await freePort(), await freePort()]
    const lines: string[] = []
    const seen: Record<string, string | undefined> = {}
    const running = await startDevFrontends({
      frontends: [
        {
          name: 'app',
          cwd: process.cwd(),
          command: [process.execPath, '-e', serverScript(p1)],
          port: p1,
          healthPath: '/',
          primary: true,
        },
        {
          name: 'admin',
          cwd: process.cwd(),
          command: [process.execPath, '-e', serverScript(p2)],
          port: p2,
          healthPath: '/',
          primary: false,
        },
      ],
      envFor: (f) => {
        seen[f.name] = 'x'
        return { ...process.env, FRONTEND_NAME: f.name }
      },
      write: (l) => lines.push(l),
    })
    assert.deepEqual(
      running.urls.map((u) => [u.name, u.primary]),
      [
        ['app', true],
        ['admin', false],
      ]
    )
    assert.ok(
      lines.includes(`[admin] up ${p2}`) ||
        lines.some((l) => l.startsWith('[app  ] up'))
    )
    assert.deepEqual(Object.keys(seen), ['app', 'admin'])
    running.stop()
    const res = await Promise.race([
      running.failure,
      new Promise((r) => setTimeout(() => r('quiet'), 300)),
    ])
    assert.equal(res, 'quiet')
  })

  test('a frontend that dies after start reports the failure', async () => {
    const port = await freePort()
    const running = await startDevFrontends({
      frontends: [
        {
          name: 'app',
          cwd: process.cwd(),
          command: [
            process.execPath,
            '-e',
            `require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1',()=>setTimeout(()=>process.exit(3),300))`,
          ],
          port,
          healthPath: '/',
          primary: true,
        },
      ],
      envFor: () => process.env,
      write: () => {},
    })
    const failure = await running.failure
    assert.equal(failure.name, 'app')
    assert.match(failure.reason, /exited \(3\)/)
  })

  test('a frontend that dies before it is healthy rejects the start', async () => {
    const port = await freePort()
    await assert.rejects(
      startDevFrontends({
        frontends: [
          {
            name: 'app',
            cwd: process.cwd(),
            command: [process.execPath, '-e', 'process.exit(2)'],
            port,
            healthPath: '/',
            primary: true,
          },
        ],
        envFor: () => process.env,
        write: () => {},
      }),
      /frontend "app" exited \(2\)/
    )
  })

  test('a busy frontend port is refused before anything is spawned', async () => {
    const { server, port } = await listen(200)
    try {
      await assert.rejects(
        startDevFrontends({
          frontends: [
            {
              name: 'app',
              cwd: process.cwd(),
              command: [process.execPath, '-e', 'process.exit(0)'],
              port,
              healthPath: '/',
              primary: true,
            },
          ],
          envFor: () => process.env,
          write: () => {},
        }),
        /already in use/
      )
    } finally {
      server.close()
    }
  })
})
