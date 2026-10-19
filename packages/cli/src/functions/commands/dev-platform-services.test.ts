import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadDevPlatformServices,
  mergeDevPlatformServices,
} from './dev-platform-services.js'

describe('mergeDevPlatformServices', () => {
  let root: string
  const file = 'contributors.gen.ts'
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-dev-merge-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const generated = (body: string) =>
    writeFileSync(
      join(root, 'contributors.gen.js'),
      `export const createPlatformServices = async (env, runtime = {}) => { ${body} }\n`
    )

  test('what the contributors return reaches the services and beats the local ones', async () => {
    generated(
      `return { emailService: { url: env.MAIL_URL }, sawLocal: runtime.local }`
    )
    const merged = await mergeDevPlatformServices(
      { local: 1, emailService: 'local' },
      root,
      file,
      { MAIL_URL: 'smtp://host' }
    )
    assert.deepEqual(merged, {
      local: 1,
      emailService: { url: 'smtp://host' },
      sawLocal: 1,
    })
  })

  test('no generated file leaves the local services untouched', async () => {
    const local = { local: 1 }
    assert.strictEqual(
      await mergeDevPlatformServices(local, root, file, {}),
      local
    )
  })

  test('production skips the file', async () => {
    generated(`return { b: 'new' }`)
    const local = { local: 1 }
    assert.strictEqual(
      await mergeDevPlatformServices(local, root, file, {
        NODE_ENV: 'production',
      }),
      local
    )
  })

  describe('server lifecycle hooks', () => {
    const withHooks = () =>
      writeFileSync(
        join(root, 'contributors.gen.js'),
        `export const createPlatformServices = async () => ({ x: 1 })\n` +
          `export const serverStartHooks = [{ name: 'a', run: () => {} }]\n` +
          `export const serverStopHooks = [{ name: 'a', run: () => {} }]\n`
      )

    test("the file's hook lists come back beside the merged services", async () => {
      withHooks()
      const loaded = await loadDevPlatformServices({ local: 1 }, root, file, {})
      assert.deepEqual(loaded.services, { local: 1, x: 1 })
      assert.deepEqual(
        loaded.startHooks.map((h) => h.name),
        ['a']
      )
      assert.deepEqual(
        loaded.stopHooks.map((h) => h.name),
        ['a']
      )
    })

    test('production and a missing file mean no hooks', async () => {
      withHooks()
      const production = await loadDevPlatformServices({}, root, file, {
        NODE_ENV: 'production',
      })
      assert.deepEqual([production.startHooks, production.stopHooks], [[], []])
      const missing = await loadDevPlatformServices({}, root, 'nope.gen.ts', {})
      assert.deepEqual([missing.startHooks, missing.stopHooks], [[], []])
    })
  })
})
