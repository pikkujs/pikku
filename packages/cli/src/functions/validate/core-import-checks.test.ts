import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runCoreImportChecks } from './core-import-checks.js'

const write = async (root: string, rel: string, content: string) => {
  const file = join(root, rel)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

const project = async (pikkuConfig = '{}\n') => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-core-import-'))
  await write(root, 'pikku.config.json', pikkuConfig)
  return root
}

describe('core import checks', () => {
  test('flags a wiring name taken from core and names the leaf', async () => {
    const root = await project()
    await write(
      root,
      'src/todo.function.ts',
      `import { pikkuFunc } from '@pikku/core/function'\n`
    )

    const findings = await runCoreImportChecks(root)
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.id, 'core-import')
    assert.equal(findings[0]!.severity, 'error')
    assert.match(findings[0]!.message, /@pikku\/core\/function/)
    assert.equal(
      findings[0]!.fixHint,
      "Import the same names from '#pikku/function'"
    )
  })

  test('flags the core root', async () => {
    const root = await project()
    await write(root, 'src/a.ts', `import { something } from '@pikku/core'\n`)

    const findings = await runCoreImportChecks(root)
    assert.equal(findings.length, 1)
  })

  test('maps the subpaths whose leaf is named differently', async () => {
    const root = await project()
    await write(
      root,
      'src/a.ts',
      `import { NotFoundError } from '@pikku/core/errors'\n` +
        `import { defineSecret } from '@pikku/core/secret'\n` +
        `import { defineSystemRole } from '@pikku/core/role'\n` +
        `import { pikkuAgentScorer } from '@pikku/core/agent-scorer'\n`
    )

    const hints = (await runCoreImportChecks(root)).map((f) => f.fixHint)
    assert.deepEqual(hints, [
      "Import the same names from '#pikku/error'",
      "Import the same names from '#pikku/secrets'",
      "Import the same names from '#pikku/scopes'",
      "Import the same names from '#pikku/agent'",
    ])
  })

  test('points the scenario surface at the entry this project maps', async () => {
    const root = await project()
    await write(
      root,
      'package.json',
      JSON.stringify({ imports: { '#pikku/scenario': './.pikku/x.ts' } })
    )
    await write(
      root,
      'tests/a.ts',
      `import { requireActor } from '@pikku/core/scenario'\n`
    )

    const findings = await runCoreImportChecks(root)
    assert.equal(
      findings[0]!.fixHint,
      "Import the same names from '#pikku/scenario'"
    )
  })

  test('falls back to the generated scenarios leaf', async () => {
    const root = await project()
    await write(root, 'package.json', '{}')
    await write(
      root,
      'tests/a.ts',
      `import { PERSONAS } from '@pikku/core/persona'\n`
    )

    const findings = await runCoreImportChecks(root)
    assert.equal(
      findings[0]!.fixHint,
      "Import the same names from '#pikku/scenarios'"
    )
  })

  test('reports a subpath with no leaf as a generator gap', async () => {
    const root = await project()
    await write(
      root,
      'src/a.ts',
      `import { parseDurationString } from '@pikku/core/utils'\n`
    )

    const findings = await runCoreImportChecks(root)
    assert.equal(findings.length, 1)
    assert.match(findings[0]!.fixHint, /gap in what the CLI emits/)
  })

  test('accepts the service implementations bootstrap picks', async () => {
    const root = await project()
    await write(
      root,
      'src/services.ts',
      `import { LocalSecretService, ConsoleLogger } from '@pikku/core/services'\n` +
        `import { LocalMeta } from '@pikku/core/services/local-meta'\n`
    )

    assert.deepEqual(await runCoreImportChecks(root), [])
  })

  test('accepts the alias', async () => {
    const root = await project()
    await write(
      root,
      'src/a.ts',
      `import { pikkuFunc } from '#pikku/function'\n` +
        `import { Kysely } from '@pikku/kysely'\n`
    )

    assert.deepEqual(await runCoreImportChecks(root), [])
  })

  test('ignores generated output, declarations and dependencies', async () => {
    const root = await project()
    await write(
      root,
      'src/a.gen.ts',
      `import { pikkuFunc } from '@pikku/core/function'\n`
    )
    await write(
      root,
      'src/application-types.d.ts',
      `import type { CoreConfig } from '@pikku/core/types'\n`
    )
    await write(
      root,
      '.pikku/a.ts',
      `import { pikkuFunc } from '@pikku/core/function'\n`
    )
    await write(
      root,
      'node_modules/dep/index.ts',
      `import { pikkuFunc } from '@pikku/core/function'\n`
    )

    assert.deepEqual(await runCoreImportChecks(root), [])
  })

  test('honours the lint severity, including off', async () => {
    const source = `import { wireHTTP } from '@pikku/core/http'\n`

    const warned = await project('{ "lint": { "coreImport": "warn" } }\n')
    await write(warned, 'src/a.ts', source)
    const findings = await runCoreImportChecks(warned)
    assert.equal(findings[0]!.severity, 'warn')

    const off = await project('{ "lint": { "coreImport": "off" } }\n')
    await write(off, 'src/a.ts', source)
    assert.deepEqual(await runCoreImportChecks(off), [])
  })

  test('reads re-exports as well as imports', async () => {
    const root = await project()
    await write(root, 'src/a.ts', `export * from '@pikku/core/workflow'\n`)

    assert.equal((await runCoreImportChecks(root)).length, 1)
  })
})
