import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlatformServiceContributor } from '@pikku/deploy'
import { serializeDevPlatformServices } from '../wirings/cli/serialize-dev-platform-services.js'
import { loadDevContributors } from '../wirings/cli/write-dev-platform-services.js'
import { mergeDevPlatformServices } from './dev-platform-services.js'

const contributor: PlatformServiceContributor = {
  name: 'email',
  emit: () => [`  services.emailService = { from: 'host', url: env.MAIL_URL }`],
}

const platform = {
  serviceNames: [],
  needsQueue: false,
  needsWorkflow: false,
  needsAgent: false,
}

describe('mergeDevPlatformServices', () => {
  let root: string
  const file = '.pikku/pikku-dev-platform-services.gen.ts'
  const spied = { from: 'local-spy' }
  const localServices = { emailService: spied, kysely: null }

  const createSingletonServices = async (
    _config: unknown,
    existing: Record<string, any>
  ) => ({ ...existing, emailService: existing.emailService ?? 'fallback' })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-dev-platform-'))
    mkdirSync(join(root, '.pikku'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const writeGenerated = () =>
    writeFileSync(
      join(root, file),
      serializeDevPlatformServices([contributor], platform)
    )

  test('a contributor emailService reaches createSingletonServices and beats the local one', async () => {
    writeGenerated()
    const merged = await mergeDevPlatformServices(localServices, root, file, {
      MAIL_URL: 'smtp://host',
    })
    const services = await createSingletonServices({}, merged)
    assert.deepEqual(services.emailService, {
      from: 'host',
      url: 'smtp://host',
    })
    assert.strictEqual(services.kysely, null)
  })

  test('with no generated file the local services pass through untouched', async () => {
    const merged = await mergeDevPlatformServices(localServices, root, file, {})
    assert.strictEqual(merged, localServices)
    assert.strictEqual(merged.emailService, spied)
  })

  test('a service the contributors do not set keeps its local value', async () => {
    writeFileSync(
      join(root, file),
      serializeDevPlatformServices(
        [{ name: 'other', emit: () => [`  services.other = 1`] }],
        platform
      )
    )
    const merged = await mergeDevPlatformServices(localServices, root, file, {})
    assert.strictEqual(merged.emailService, spied)
    assert.equal(merged.other, 1)
  })

  test('NODE_ENV=production ignores the file', async () => {
    writeGenerated()
    const merged = await mergeDevPlatformServices(localServices, root, file, {
      NODE_ENV: 'production',
    })
    assert.strictEqual(merged, localServices)
  })
})

describe('loadDevContributors', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-dev-contributors-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('loads a named export and a default export relative to the root', async () => {
    writeFileSync(
      join(root, 'contributors.ts'),
      `export const email = { name: 'email', emit: () => [] }\nexport default { name: 'other', emit: () => [] }\n`
    )
    const loaded = await loadDevContributors(root, [
      { module: './contributors.ts', export: 'email' },
      { module: './contributors.ts' },
    ])
    assert.deepEqual(
      loaded.map((c) => c.name),
      ['email', 'other']
    )
  })

  test('refuses an export that is not a contributor', async () => {
    writeFileSync(join(root, 'bad.ts'), `export default { name: 'x' }\n`)
    await assert.rejects(
      loadDevContributors(root, [{ module: './bad.ts' }]),
      /not a PlatformServiceContributor/
    )
  })
})
