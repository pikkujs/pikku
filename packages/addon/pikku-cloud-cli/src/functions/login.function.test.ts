import { after, describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'

const realConfig = { ...configLib }
const realHttp = { ...httpLib }
let override = true
const invoked: { name: string; data: any }[] = []

await mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override
      ? { apiUrl: 'https://cloud.test', token: null, project: null }
      : realConfig.resolveApiContext(opts),
}))

await mock.module('../lib/http.js', () => ({
  ...realHttp,
  getCloudRPC: (opts: any) =>
    override
      ? {
          invoke: async (name: string, data: any) => {
            invoked.push({ name, data })
            if (name === 'requestCliAuth')
              return {
                code: 'ABCD-EFGH',
                deviceCode: 'device-secret',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              }
            return { status: 'confirmed', token: 'tok-1' }
          },
        }
      : realHttp.getCloudRPC(opts),
}))

const realHome = process.env.HOME
after(() => {
  override = false
  process.env.HOME = realHome
})

const { CloudLogin } = await import('./login.function.js')

describe('cloud login', () => {
  test('polls with the device code, never the typed code', async () => {
    const home = mkdtempSync(join(tmpdir(), 'pikku-login-'))
    process.env.HOME = home
    const result = await CloudLogin.func(
      {} as any,
      { browser: false } as any,
      {} as any
    )
    assert.deepStrictEqual(result, { ok: true, apiUrl: 'https://cloud.test' })
    assert.deepStrictEqual(invoked[1], {
      name: 'pollCliAuth',
      data: { deviceCode: 'device-secret' },
    })
    const saved = JSON.parse(
      readFileSync(join(home, '.pikkustudio', 'auth.json'), 'utf8')
    )
    assert.strictEqual(saved.tokens['https://cloud.test'], 'tok-1')
  })
})
