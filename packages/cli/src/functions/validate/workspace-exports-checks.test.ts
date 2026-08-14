import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runWorkspaceExportsChecks } from './workspace-exports-checks.js'
import { planValidation } from './validate-registry.js'

const makeTmp = () => mkdtemp(join(tmpdir(), 'pikku-workspace-exports-'))

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2))
}

/**
 * The shape that motivated the check: a generated client whose files are
 * `*.gen.ts` on disk, imported extensionless, behind an exports map that
 * substitutes no extension.
 */
const makeSdkWorkspace = async (root: string, exportsField: unknown) => {
  await writeJson(join(root, 'package.json'), {
    name: 'root',
    workspaces: ['apps/*', 'packages/*'],
  })

  await writeJson(join(root, 'packages', 'sdk', 'package.json'), {
    name: '@acme/sdk',
    exports: exportsField,
  })
  await mkdir(join(root, 'packages', 'sdk', 'src', 'pikku'), {
    recursive: true,
  })
  await writeFile(
    join(root, 'packages', 'sdk', 'src', 'pikku', 'client.gen.ts'),
    'export const client = 1\n'
  )
  await writeFile(
    join(root, 'packages', 'sdk', 'src', 'pikku', 'rpc-map.gen.d.ts'),
    'export type Map = never\n'
  )

  await writeJson(join(root, 'apps', 'console', 'package.json'), {
    name: '@acme/console',
    dependencies: { '@acme/sdk': 'workspace:*' },
  })
  await mkdir(join(root, 'apps', 'console', 'src'), { recursive: true })
}

const writeConsumer = (root: string, body: string) =>
  writeFile(join(root, 'apps', 'console', 'src', 'main.ts'), body)

describe('workspace exports checks', () => {
  test('flags an extensionless subpath the exports map cannot resolve', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, { './pikku/*': './src/pikku/*' })
    await writeConsumer(
      root,
      "import { client } from '@acme/sdk/pikku/client.gen'\n"
    )

    const findings = await runWorkspaceExportsChecks(root)
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.id, 'workspace-subpath-not-exported')
    assert.equal(findings[0]!.severity, 'error')
    assert.match(findings[0]!.message, /client\.gen/)
  })

  test('accepts a map that substitutes the real extension', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, { './pikku/*': './src/pikku/*.ts' })
    await writeConsumer(
      root,
      "import { client } from '@acme/sdk/pikku/client.gen'\n"
    )

    assert.deepEqual(await runWorkspaceExportsChecks(root), [])
  })

  test('resolves a declaration-only subpath through a fallback array', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, {
      './pikku/*': ['./src/pikku/*.ts', './src/pikku/*.d.ts'],
    })
    await writeConsumer(
      root,
      [
        "import { client } from '@acme/sdk/pikku/client.gen'",
        "import type { Map } from '@acme/sdk/pikku/rpc-map.gen'",
      ].join('\n')
    )

    assert.deepEqual(await runWorkspaceExportsChecks(root), [])
  })

  test('prefers the longer pattern so a .js specifier maps to source', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, {
      './pikku/*.js': './src/pikku/*.ts',
      './pikku/*': ['./src/pikku/*.ts', './src/pikku/*.d.ts'],
    })
    await writeConsumer(
      root,
      "import { client } from '@acme/sdk/pikku/client.gen.js'\n"
    )

    assert.deepEqual(await runWorkspaceExportsChecks(root), [])
  })

  test('ignores a package that publishes no exports field', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, undefined)
    await writeConsumer(
      root,
      "import { client } from '@acme/sdk/pikku/client.gen'\n"
    )

    assert.deepEqual(await runWorkspaceExportsChecks(root), [])
  })

  test('ignores third-party and relative specifiers', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, { './pikku/*': './src/pikku/*' })
    await writeConsumer(
      root,
      [
        "import react from 'react/jsx-runtime'",
        "import './local/thing.js'",
      ].join('\n')
    )

    assert.deepEqual(await runWorkspaceExportsChecks(root), [])
  })

  test('reports each broken subpath once, not once per importer', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, { './pikku/*': './src/pikku/*' })
    await writeConsumer(
      root,
      "import { client } from '@acme/sdk/pikku/client.gen'\n"
    )
    await writeFile(
      join(root, 'apps', 'console', 'src', 'other.ts'),
      "import { client } from '@acme/sdk/pikku/client.gen'\n"
    )

    const findings = await runWorkspaceExportsChecks(root)
    assert.equal(findings.length, 1)
  })

  test('is planned at the workspace root only', async () => {
    const root = await makeTmp()
    await makeSdkWorkspace(root, { './pikku/*': './src/pikku/*' })

    const plan = await planValidation(root)
    const targets = plan
      .filter(({ check }) => check.id === 'workspace-exports')
      .map(({ target }) => target.label)
    assert.deepEqual(targets, ['.'])
  })
})
