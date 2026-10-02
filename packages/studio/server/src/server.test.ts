import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { StudioProjectsService, type FabricAccount } from './projects.js'
import { startStudioServer } from './server.js'

const account = (signedIn: { value: boolean }): FabricAccount => ({
  account: async () => ({ signedIn: signedIn.value, apiUrl: 'http://fabric', consoleUrl: 'http://fabric' }),
  projects: async () => [],
  startSignIn: async () => ({ code: 'WXYZ', url: 'http://fabric/cli-auth', expiresAt: new Date().toISOString() }),
  pollSignIn: async () => {
    signedIn.value = true
    return 'confirmed'
  },
  signOut: async () => {
    signedIn.value = false
  },
})

const echoServer = `
const http = require('node:http')
http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ path: req.url, studio: req.headers['x-pikku-studio'] ?? null, token: process.env.PIKKU_STUDIO_TOKEN }))
}).listen(Number(process.env.PORT), '127.0.0.1')
`

const setup = async () => {
  const base = await mkdtemp(join(tmpdir(), 'pikku-studio-server-'))
  const consoleDir = join(base, 'console-app')
  await mkdir(join(consoleDir, 'assets'), { recursive: true })
  await writeFile(join(consoleDir, 'index.html'), '<html><head><title>c</title></head></html>')
  await writeFile(join(consoleDir, 'assets', 'app.js'), 'console.log(1)')
  await writeFile(join(base, 'echo.cjs'), echoServer)
  const signedIn = { value: false }
  const projects = new StudioProjectsService({
    account: account(signedIn),
    home: join(base, 'studio'),
    projectsDir: join(base, 'Pikku'),
    installCommand: () => null,
    devCommand: () => ({ command: process.execPath, args: [join(base, 'echo.cjs')] }),
  })
  const studio = await startStudioServer({ port: 0, projects, consoleDir, home: join(base, 'studio') })
  const call = async (name: string, input: unknown = {}) => {
    const res = await fetch(`${studio.url}/studio/${name}`, { method: 'POST', body: JSON.stringify(input) })
    return { status: res.status, body: await res.json() }
  }
  return { base, studio, call }
}

describe('Studio server', () => {
  test('asks to choose, then remembers working locally', async () => {
    const { studio, call } = await setup()
    try {
      assert.equal((await call('account')).body.signIn, null)
      await call('useLocally')
      assert.equal((await call('account')).body.signIn, 'local')
      await call('signOut')
      assert.equal((await call('account')).body.signIn, null)
    } finally {
      await studio.close()
    }
  })

  test('signs in with Fabric by code', async () => {
    const { studio, call } = await setup()
    try {
      assert.equal((await call('startSignIn')).body.code, 'WXYZ')
      assert.equal((await call('pollSignIn', { code: 'WXYZ' })).body.status, 'confirmed')
      assert.equal((await call('account')).body.signIn, 'fabric')
      assert.deepEqual((await call('account')).body.ai, { kind: 'fabric' })
      await call('signOut')
      assert.equal((await call('account')).body.ai, null)
    } finally {
      await studio.close()
    }
  })

  test('serves the console flagged as Studio, with SPA fallback', async () => {
    const { studio } = await setup()
    try {
      const page = await (await fetch(`${studio.url}/console/projects`)).text()
      assert.match(page, /window\.__PIKKU_STUDIO__/)
      assert.equal(await (await fetch(`${studio.url}/console/assets/app.js`)).text(), 'console.log(1)')
      const root = await fetch(`${studio.url}/`, { redirect: 'manual' })
      assert.equal(root.headers.get('location'), '/console/')
    } finally {
      await studio.close()
    }
  })

  test('proxies an open project with its token', async () => {
    const { base, studio, call } = await setup()
    try {
      const path = join(base, 'notes')
      await mkdir(path)
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: path })
      const added = (await call('addProject', { path })).body
      assert.equal((await call('openProject', { key: added.key })).body.serverUrl, `/p/${added.key}`)
      const echoed = await (await fetch(`${studio.url}/p/${added.key}/rpc/x?y=1`)).json()
      assert.equal(echoed.path, '/rpc/x?y=1')
      assert.equal(echoed.studio, echoed.token)
      assert.equal(echoed.token.length, 64)
      assert.equal((await fetch(`${studio.url}/p/nope/rpc/x`)).status, 404)
    } finally {
      await studio.close()
    }
  })
})
