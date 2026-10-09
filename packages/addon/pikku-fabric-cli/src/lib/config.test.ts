import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// `authFilePath` is fixed when config.js loads, so HOME has to point somewhere
// disposable first — otherwise these tests read the developer's own login.
const home = await mkdtemp(join(tmpdir(), 'pikku-fabric-home-'))
process.env.HOME = home
const { resolveApiContext, writeAuthFile, DEFAULT_API_URL } =
  await import('./config.js')

const makeTmp = () => mkdtemp(join(tmpdir(), 'pikku-fabric-config-'))

describe('resolveApiContext', () => {
  const savedEnv = { ...process.env }
  beforeEach(async () => {
    delete process.env.FABRIC_API_URL
    delete process.env.FABRIC_PROJECT_ID
    await writeAuthFile({ tokens: {} })
  })
  afterEach(() => {
    process.env = { ...savedEnv, HOME: home }
  })

  test('falls back to the default api url', async () => {
    const ctx = await resolveApiContext({
      startDir: await makeTmp(),
      resolveProject: false,
    })
    assert.equal(ctx.apiUrl, DEFAULT_API_URL)
    assert.equal(ctx.apiUrlSource, 'default')
    assert.equal(ctx.token, null)
  })

  test('the last login beats the default but not FABRIC_API_URL', async () => {
    await writeAuthFile({
      tokens: { 'http://localhost:4002': 'tok' },
      defaultApiUrl: 'http://localhost:4002',
    })
    const dir = await makeTmp()

    const fromLogin = await resolveApiContext({
      startDir: dir,
      resolveProject: false,
    })
    assert.equal(fromLogin.apiUrl, 'http://localhost:4002')
    assert.equal(fromLogin.apiUrlSource, 'login')
    assert.equal(fromLogin.token, 'tok')

    process.env.FABRIC_API_URL = 'http://127.0.0.1:4002'
    const fromEnv = await resolveApiContext({
      startDir: dir,
      resolveProject: false,
    })
    assert.equal(fromEnv.apiUrlSource, 'env')
    assert.equal(fromEnv.token, null)
  })

  test('the flag beats env', async () => {
    const dir = await makeTmp()
    process.env.FABRIC_API_URL = 'http://127.0.0.1:4002'

    const fromFlag = await resolveApiContext({
      startDir: dir,
      apiUrlOverride: 'http://localhost:4003',
      resolveProject: false,
    })
    assert.equal(fromFlag.apiUrl, 'http://localhost:4003')
    assert.equal(fromFlag.apiUrlSource, 'flag')
  })

  test('resolveProject: false leaves the project unresolved', async () => {
    const dir = await makeTmp()
    const ctx = await resolveApiContext({
      startDir: dir,
      resolveProject: false,
    })
    assert.equal(ctx.projectId, null)
    assert.equal(ctx.project, null)
  })

  test('rejects plain http to a non-loopback host, naming the URL and its source', async () => {
    const dir = await makeTmp()
    await writeAuthFile({ tokens: { 'http://api.example.com': 'tok' } })

    await assert.rejects(
      resolveApiContext({
        startDir: dir,
        apiUrlOverride: 'http://api.example.com',
        resolveProject: false,
      }),
      /http:\/\/api\.example\.com.*--api-url flag.*unencrypted/
    )

    process.env.FABRIC_API_URL = 'http://api.example.com'
    await assert.rejects(
      resolveApiContext({ startDir: dir, resolveProject: false }),
      /FABRIC_API_URL/
    )
  })

  test('rejects a stored plain-http login for a non-loopback host', async () => {
    await writeAuthFile({
      tokens: { 'http://api.example.com': 'tok' },
      defaultApiUrl: 'http://api.example.com',
    })
    await assert.rejects(
      resolveApiContext({ startDir: await makeTmp(), resolveProject: false }),
      /your last login/
    )
  })

  test('allows http on every loopback form and https anywhere', async () => {
    for (const apiUrl of [
      'http://localhost:4002',
      'http://127.0.0.1:4002',
      'http://[::1]:4002',
      'https://api.example.com',
    ]) {
      const ctx = await resolveApiContext({
        startDir: await makeTmp(),
        apiUrlOverride: apiUrl,
        resolveProject: false,
      })
      assert.equal(ctx.apiUrl, apiUrl)
    }
  })

  test('rejects a URL that does not parse', async () => {
    await assert.rejects(
      resolveApiContext({
        startDir: await makeTmp(),
        apiUrlOverride: 'not a url',
        resolveProject: false,
      }),
      /Invalid fabric api url/
    )
  })
})
