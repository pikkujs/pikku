import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadDevProviders } from './dev-providers.js'

const scratchRoot = () => {
  const dir = join(import.meta.dir, '../../..', '.tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('loadDevProviders', () => {
  let root: string
  const file = 'services.gen.ts'
  beforeEach(() => {
    root = mkdtempSync(join(scratchRoot(), 'pikku-dev-providers-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const generated = (body: string, hooks = '') =>
    writeFileSync(
      join(root, 'services.gen.js'),
      `export const createPlatformServices = async (env, runtime = {}) => { ${body} }\n${hooks}`
    )

  test('what the services provide reaches the services and beats the local ones', async () => {
    generated(
      `return { ...runtime, emailService: { url: env.MAIL_URL }, sawLocal: runtime.local }`
    )
    const { services } = await loadDevProviders(
      { local: 1, emailService: 'local' },
      root,
      file,
      [],
      { MAIL_URL: 'smtp://host' }
    )
    assert.deepEqual(services, {
      local: 1,
      emailService: { url: 'smtp://host' },
      sawLocal: 1,
    })
  })

  test('no generated file leaves the local services untouched', async () => {
    const local = { local: 1 }
    const loaded = await loadDevProviders(local, root, file, [], {})
    assert.strictEqual(loaded.services, local)
    assert.deepEqual(loaded.startHooks, [])
  })

  test('production skips the file', async () => {
    generated(`return { b: 'new' }`)
    const local = { local: 1 }
    const loaded = await loadDevProviders(local, root, file, [], {
      NODE_ENV: 'production',
    })
    assert.strictEqual(loaded.services, local)
  })

  test("the file's start hooks come back beside the services", async () => {
    generated(
      `return { ...runtime, x: 1 }`,
      `export const serverStartHooks = [{ name: 'a', run: () => {} }]\n`
    )
    const loaded = await loadDevProviders({ local: 1 }, root, file, [], {})
    assert.deepEqual(loaded.services, { local: 1, x: 1 })
    assert.deepEqual(
      loaded.startHooks.map((hook) => hook.name),
      ['a']
    )
  })

  test('a baseline key dev did not inject is an error naming it', async () => {
    generated(`return { ...runtime }`)
    await assert.rejects(
      loadDevProviders({ logger: 1 }, root, file, ['logger', 'kysely'], {}),
      /'kysely'.*do not have it/s
    )
  })
})
