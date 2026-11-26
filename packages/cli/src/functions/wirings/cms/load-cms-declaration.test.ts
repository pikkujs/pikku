import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadCmsDeclaration } from './load-cms-declaration.js'
import { cmsTempDir } from '../../../../test-fixtures/cms/temp-dir.js'

const roots: string[] = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

const project = async (source?: string) => {
  const root = await cmsTempDir('pikku-cms-load-')
  roots.push(root)
  await mkdir(join(root, 'db'))
  if (source !== undefined) await writeFile(join(root, 'db/cms.ts'), source)
  return root
}

describe('loadCmsDeclaration', () => {
  test('a project with no db/cms.ts has no CMS', async () => {
    assert.equal(await loadCmsDeclaration(await project()), null)
  })

  test('reads the exported data', async () => {
    const root = await project(
      `export const cms = { a: { label: 'A', list: { columns: ['id'] } } }\n`
    )
    assert.deepEqual(await loadCmsDeclaration(root), {
      a: { label: 'A', list: { columns: ['id'] } },
    })
  })

  test('refuses a file with no cms export', async () => {
    const root = await project(`export const other = {}\n`)
    await assert.rejects(loadCmsDeclaration(root), /must export `const cms/)
  })

  for (const [what, value, path] of [
    ['a function', '() => true', 'cms.a.label'],
    ['a class instance', 'new Date(0)', 'cms.a.label'],
    ['a number that is no number', 'Number.NaN', 'cms.a.label'],
  ] as const) {
    test(`refuses ${what}, which is not data`, async () => {
      const root = await project(
        `export const cms = { a: { label: ${value} } }\n`
      )
      await assert.rejects(
        loadCmsDeclaration(root),
        new RegExp(`plain data, and ${path.replaceAll('.', '\\.')} is not`)
      )
    })
  }

  test('says when the file cannot be loaded', async () => {
    const root = await project(`export const cms = {\n`)
    await assert.rejects(loadCmsDeclaration(root), /could not be loaded/)
  })
})
