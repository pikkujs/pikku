import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const inspectSources = async (sources: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-define-contributors-'))
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: () => {},
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  } as unknown as InspectorLogger
  const files: Record<string, string> = {}
  for (const [name, source] of Object.entries(sources)) {
    const file = join(rootDir, name)
    await writeFile(file, source)
    files[name] = file
  }
  try {
    const state = await inspect(logger, Object.values(files), { rootDir })
    return { state, criticals, files }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const contributor = (name: string) =>
  `export const ${name} = { provides: ['${name}'], run() {} }\n`

describe('addDefineContributors', () => {
  test('records the module and export of each variant, found through an import', async () => {
    const { state, criticals, files } = await inspectSources({
      'inbox.ts': contributor('inboxDev') + contributor('inboxDeploy'),
      'index.ts': [
        `import { defineContributors } from '@pikku/core/contributors'`,
        `import { inboxDev, inboxDeploy as deployVariant } from './inbox.js'`,
        `export const contributors = defineContributors({`,
        `  inbox: { dev: inboxDev, deploy: deployVariant },`,
        `})`,
      ].join('\n'),
    })
    assert.deepEqual(criticals, [])
    assert.deepEqual(state.contributorsManifest, {
      inbox: {
        dev: { module: files['inbox.ts'], export: 'inboxDev' },
        deploy: { module: files['inbox.ts'], export: 'inboxDeploy' },
      },
    })
  })

  test('dev and deploy are each optional, and a const in the same file is found', async () => {
    const { state, criticals, files } = await inspectSources({
      'index.ts': [
        `import { defineContributors } from '@pikku/core/contributors'`,
        `export const queueDeploy = { run() {} }`,
        `const unexported = 1`,
        `export const contributors = defineContributors({`,
        `  queue: { deploy: queueDeploy },`,
        `})`,
      ].join('\n'),
    })
    assert.deepEqual(criticals, [])
    assert.deepEqual(state.contributorsManifest, {
      queue: { deploy: { module: files['index.ts'], export: 'queueDeploy' } },
    })
  })

  test('a variant that is not exported is a critical error naming it', async () => {
    const { state, criticals } = await inspectSources({
      'index.ts': [
        `import { defineContributors } from '@pikku/core/contributors'`,
        `const hidden = { run() {} }`,
        `defineContributors({ inbox: { dev: hidden } })`,
      ].join('\n'),
    })
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.CONTRIBUTORS_NOT_STATIC)
    assert.match(
      criticals[0]!.message,
      /Contributor 'inbox' dev 'hidden' is not exported/
    )
    assert.equal(state.contributorsManifest, undefined)
  })

  test('an inline contributor is refused: a host could not import just it', async () => {
    const { criticals } = await inspectSources({
      'index.ts': [
        `import { defineContributors } from '@pikku/core/contributors'`,
        `defineContributors({ inbox: { dev: { run() {} } } })`,
      ].join('\n'),
    })
    assert.equal(criticals.length, 1)
    assert.match(
      criticals[0]!.message,
      /Contributor 'inbox' dev must be a reference to an exported const/
    )
  })

  test('an entry with neither variant, or a stray key, is refused', async () => {
    const { criticals } = await inspectSources({
      'index.ts': [
        `import { defineContributors } from '@pikku/core/contributors'`,
        `export const a = { run() {} }`,
        `defineContributors({ empty: {}, odd: { prod: a } })`,
      ].join('\n'),
    })
    assert.equal(criticals.length, 2)
    assert.match(
      criticals[0]!.message,
      /Contributor 'empty' declares neither dev nor deploy/
    )
    assert.match(
      criticals[1]!.message,
      /Contributor 'odd' takes only dev and deploy/
    )
  })

  test('a name defined twice is a critical error', async () => {
    const { state, criticals, files } = await inspectSources({
      'index.ts': [
        `import { defineContributors } from '@pikku/core/contributors'`,
        `export const a = { run() {} }`,
        `export const b = { run() {} }`,
        `defineContributors({ inbox: { dev: a } })`,
        `defineContributors({ inbox: { dev: b } })`,
      ].join('\n'),
    })
    assert.equal(criticals.length, 1)
    assert.equal(criticals[0]!.code, ErrorCode.CONTRIBUTOR_NAME_DUPLICATED)
    assert.match(criticals[0]!.message, /'inbox' is defined twice/)
    assert.deepEqual(state.contributorsManifest?.inbox?.dev, {
      module: files['index.ts'],
      export: 'a',
    })
  })

  test('a non-literal argument is refused', async () => {
    const { criticals } = await inspectSources({
      'index.ts': [
        `import { defineContributors } from '@pikku/core/contributors'`,
        `declare const all: any`,
        `defineContributors(all)`,
      ].join('\n'),
    })
    assert.equal(criticals.length, 1)
    assert.match(
      criticals[0]!.message,
      /object literal keyed by contributor name, got: all/
    )
  })

  test('a same-named local helper is not claimed', async () => {
    const { state, criticals } = await inspectSources({
      'index.ts': `const defineContributors = (x: unknown) => x\ndefineContributors({ a: 1 })\n`,
    })
    assert.deepEqual(criticals, [])
    assert.equal(state.contributorsManifest, undefined)
  })
})
