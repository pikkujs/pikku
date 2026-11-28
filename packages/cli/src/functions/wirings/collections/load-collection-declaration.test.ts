import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadCollectionDeclaration } from './load-collection-declaration.js'
import { collectionTempDir } from '../../../../test-fixtures/collections/temp-dir.js'

const roots: string[] = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

const project = async (source?: string) => {
  const root = await collectionTempDir('pikku-collection-load-')
  roots.push(root)
  await mkdir(join(root, 'db'))
  if (source !== undefined)
    await writeFile(join(root, 'db/collections.ts'), source)
  return root
}

describe('loadCollectionDeclaration', () => {
  test('a project with no db/collections.ts declares no collections', async () => {
    assert.equal(await loadCollectionDeclaration(await project()), null)
  })

  test('reads the exported data', async () => {
    const root = await project(
      `export const collections = { a: { label: 'A', list: { columns: ['id'] } } }\n`
    )
    assert.deepEqual(await loadCollectionDeclaration(root), {
      a: { label: 'A', list: { columns: ['id'] } },
    })
  })

  test('refuses a file with no collections export', async () => {
    const root = await project(`export const other = {}\n`)
    await assert.rejects(
      loadCollectionDeclaration(root),
      /must export `const collections/
    )
  })

  for (const [what, value, path] of [
    ['a function', '() => true', 'collections.a.label'],
    ['a class instance', 'new Date(0)', 'collections.a.label'],
    ['a number that is no number', 'Number.NaN', 'collections.a.label'],
  ] as const) {
    test(`refuses ${what}, which is not data`, async () => {
      const root = await project(
        `export const collections = { a: { label: ${value} } }\n`
      )
      await assert.rejects(
        loadCollectionDeclaration(root),
        new RegExp(`plain data, and ${path.replaceAll('.', '\\.')} is not`)
      )
    })
  }

  test('says when the file cannot be loaded', async () => {
    const root = await project(`export const collections = {\n`)
    await assert.rejects(loadCollectionDeclaration(root), /could not be loaded/)
  })
})
