import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MantineCatalog } from './mantine-catalog.js'

const MANTINE_PKG = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../frontend/mantine'
)
let root: string

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'mantine-catalog-'))
  writeJson(join(root, 'package.json'), { name: 'ws', workspaces: ['apps/*'] })
  const app = join(root, 'apps', 'web')
  writeJson(join(app, 'package.json'), { name: 'web' })
  writeJson(join(app, 'node_modules/@mantine/core/package.json'), {
    name: '@mantine/core',
    version: '9.4.1',
  })
  mkdirSync(join(app, 'node_modules/@pikku'), { recursive: true })
  symlinkSync(MANTINE_PKG, join(app, 'node_modules/@pikku/mantine'), 'dir')
  writeJson(join(root, 'packages/mantine-theme/active.json'), { id: 'default' })
  writeJson(join(root, 'packages/mantine-theme/themes/default.json'), {
    structure: { components: { Button: { variants: { brand: {} } } } },
  })
})

after(() => rmSync(root, { recursive: true, force: true }))

test('finds the app that installs @mantine/core', async () => {
  const app = await new MantineCatalog(root).mantineApp()
  assert.equal(app?.dir, join(root, 'apps', 'web'))
  assert.equal(app?.mantineVersion, '9.4.1')
})

test('componentMeta merges the active theme custom variants into the manifest', async () => {
  const meta = await new MantineCatalog(root).componentMeta('Button')
  assert.equal(meta.source, 'manifest')
  assert.ok(meta.variantOptions.includes('brand'))
  assert.ok(meta.variantOptions.includes('filled'))
  assert.ok(meta.props.includes('fullWidth'))
})

test('componentNames lists the manifest matching the installed major', async () => {
  const { mantineVersion, components } = await new MantineCatalog(
    root
  ).componentNames()
  assert.equal(mantineVersion?.split('.')[0], '9')
  assert.ok(components.includes('Button'))
})

test('a workspace without @mantine/core reports source "none"', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'mantine-catalog-empty-'))
  try {
    const meta = await new MantineCatalog(empty).componentMeta('Button')
    assert.equal(meta.source, 'none')
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

test('blocks load through the installed @pikku/mantine', async () => {
  const { resolveBlock, listBlocks } = await new MantineCatalog(root).blocks()
  assert.ok(listBlocks().length > 0)
  assert.ok(resolveBlock(listBlocks()[0]!.name)?.files)
})
