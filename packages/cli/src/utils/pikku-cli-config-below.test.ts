import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findConfigFilesBelow } from './pikku-cli-config.js'

const tree = (files: string[]) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-cfg-'))
  for (const f of files) {
    mkdirSync(join(root, f, '..'), { recursive: true })
    writeFileSync(join(root, f), '{}')
  }
  return root
}

describe('findConfigFilesBelow', () => {
  test('finds the one config of a workspace below the root', async () => {
    const root = tree(['packages/functions/pikku.config.json', 'package.json'])
    assert.deepEqual(await findConfigFilesBelow(root), [
      join(root, 'packages/functions/pikku.config.json'),
    ])
  })
  test('lists every config when there are several', async () => {
    const root = tree([
      'packages/a/pikku.config.json',
      'packages/b/pikku.config.json',
    ])
    assert.equal((await findConfigFilesBelow(root)).length, 2)
  })
  test('never looks inside node_modules, dist or hidden folders, and stops at the depth', async () => {
    const root = tree([
      'node_modules/x/pikku.config.json',
      'dist/pikku.config.json',
      '.cache/pikku.config.json',
      'a/b/c/d/pikku.config.json',
    ])
    assert.deepEqual(await findConfigFilesBelow(root), [])
  })
})
