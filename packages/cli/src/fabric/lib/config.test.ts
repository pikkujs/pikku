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
      tokens: { 'http://local:4002': 'tok' },
      defaultApiUrl: 'http://local:4002',
    })
    const dir = await makeTmp()

    const fromLogin = await resolveApiContext({
      startDir: dir,
      resolveProject: false,
    })
    assert.equal(fromLogin.apiUrl, 'http://local:4002')
    assert.equal(fromLogin.apiUrlSource, 'login')
    assert.equal(fromLogin.token, 'tok')

    process.env.FABRIC_API_URL = 'http://env:4002'
    const fromEnv = await resolveApiContext({
      startDir: dir,
      resolveProject: false,
    })
    assert.equal(fromEnv.apiUrlSource, 'env')
    assert.equal(fromEnv.token, null)
  })

  test('the flag beats env', async () => {
    const dir = await makeTmp()
    process.env.FABRIC_API_URL = 'http://env:4002'

    const fromFlag = await resolveApiContext({
      startDir: dir,
      apiUrlOverride: 'http://flag:4002',
      resolveProject: false,
    })
    assert.equal(fromFlag.apiUrl, 'http://flag:4002')
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
})
