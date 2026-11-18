import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadUserConfigForDb } from './db-shared.js'
import { findConfigFactoryFile } from '../../utils/project-packages.js'

const roots: string[] = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const project = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-db-shared-'))
  roots.push(root)
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), source)
  }
  return root
}

const createConfig = (db: string) =>
  `export const createConfig = async () => ({ sqliteDb: '${db}' })\n`

const logger = { error() {}, warn() {} }

test('an ordinary project finds src/config.ts through its own directory', async () => {
  const root = project({ 'src/config.ts': createConfig('a.db') })
  assert.equal(findConfigFactoryFile(root, ['.']), join(root, 'src/config.ts'))
  const loaded = await loadUserConfigForDb({
    config: { rootDir: root, sourceDirs: ['.'] },
    logger,
  })
  assert.equal(loaded?.sqliteDb, 'a.db')
})

test('a base owns the config, ahead of anything in the project directory', async () => {
  const root = project({
    'src/config.ts': createConfig('root.db'),
    'packages/app/src/config.ts': createConfig('base.db'),
  })
  const loaded = await loadUserConfigForDb({
    config: { rootDir: root, sourceDirs: ['.', 'packages/app'] },
    logger,
  })
  assert.equal(loaded?.sqliteDb, 'base.db')
})

test('a base with the config next to its package.json is found too', async () => {
  const root = project({ 'packages/app/config.ts': createConfig('flat.db') })
  assert.equal(
    findConfigFactoryFile(root, ['.', 'packages/app']),
    join(root, 'packages/app/config.ts')
  )
})

test('no createConfig anywhere is null, and says so', async () => {
  const root = project({ 'src/other.ts': 'export {}\n' })
  const errors: string[] = []
  const loaded = await loadUserConfigForDb({
    config: { rootDir: root, sourceDirs: ['.'] },
    logger: { error: (m) => errors.push(m), warn() {} },
  })
  assert.equal(loaded, null)
  assert.equal(errors.length, 1)
})
