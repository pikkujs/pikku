import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findSourceFiles } from './find-source-files.js'

const tempDirs: string[] = []
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

const project = async (name: string) => {
  const parent = await mkdtemp(join(tmpdir(), 'pikku-src-'))
  tempDirs.push(parent)
  const root = join(parent, name)
  await mkdir(join(root, 'src', 'nested'), { recursive: true })
  await mkdir(join(root, 'src', 'dist'), { recursive: true })
  await writeFile(join(root, 'src', 'a.ts'), '')
  await writeFile(join(root, 'src', 'nested', 'b.ts'), '')
  await writeFile(join(root, 'src', 'dist', 'c.ts'), '')
  return root
}

describe('findSourceFiles', () => {
  test('finds every .ts file under each source directory, minus the ignored ones', async () => {
    const root = await project('shop')

    const files = await findSourceFiles(root, ['src'], ['**/dist/**'])

    assert.deepEqual(files.map((f) => f.slice(f.indexOf('/src/'))).sort(), [
      '/src/a.ts',
      '/src/nested/b.ts',
    ])
  })

  // A path is not a pattern: on Windows every separator is a backslash, which
  // a glob reads as an escape, and on any OS a directory can hold [ ] ( ) or {.
  test('a project path holding glob syntax is taken literally', async () => {
    const root = await project('shop [v2] (copy)')

    const files = await findSourceFiles(root, ['src'], [])

    assert.equal(files.length, 3)
  })
})
