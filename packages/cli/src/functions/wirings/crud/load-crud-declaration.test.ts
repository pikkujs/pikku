import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadCrudDeclaration } from './load-crud-declaration.js'
import { crudTempDir } from '../../../../test-fixtures/crud/temp-dir.js'

const roots: string[] = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

const project = async (source?: string) => {
  const root = await crudTempDir('pikku-crud-load-')
  roots.push(root)
  await mkdir(join(root, 'db'))
  if (source !== undefined) await writeFile(join(root, 'db/crud.ts'), source)
  return root
}

describe('loadCrudDeclaration', () => {
  test('a project with no db/crud.ts declares no CRUD', async () => {
    assert.equal(await loadCrudDeclaration(await project()), null)
  })

  test('reads the exported data', async () => {
    const root = await project(
      `export const crud = { a: { label: 'A', list: { columns: ['id'] } } }\n`
    )
    assert.deepEqual(await loadCrudDeclaration(root), {
      a: { label: 'A', list: { columns: ['id'] } },
    })
  })

  test('refuses a file with no crud export', async () => {
    const root = await project(`export const other = {}\n`)
    await assert.rejects(loadCrudDeclaration(root), /must export `const crud/)
  })

  for (const [what, value, path] of [
    ['a function', '() => true', 'crud.a.label'],
    ['a class instance', 'new Date(0)', 'crud.a.label'],
    ['a number that is no number', 'Number.NaN', 'crud.a.label'],
  ] as const) {
    test(`refuses ${what}, which is not data`, async () => {
      const root = await project(
        `export const crud = { a: { label: ${value} } }\n`
      )
      await assert.rejects(
        loadCrudDeclaration(root),
        new RegExp(`plain data, and ${path.replaceAll('.', '\\.')} is not`)
      )
    })
  }

  test('says when the file cannot be loaded', async () => {
    const root = await project(`export const crud = {\n`)
    await assert.rejects(loadCrudDeclaration(root), /could not be loaded/)
  })
})
