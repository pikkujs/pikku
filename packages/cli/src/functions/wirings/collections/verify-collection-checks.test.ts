import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildCollectionsModel } from './build-collection-model.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/collections/model-fixtures.js'
import { verifyCollectionChecks } from './verify-collection-checks.js'
import { collectionTempDir } from '../../../../test-fixtures/collections/temp-dir.js'

let base: string
let root: string

// What `pikkuAuth` and `pikkuPermission` mark their wrappers with.
const CHECKS = `
export const mayRead = Object.assign(async () => true, { __pikkuAuth: true })
export const mayWrite = async () => true
export const notACheck = true
`

before(async () => {
  base = await collectionTempDir('pikku-collection-checks-')
  root = join(base, 'project')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src/checks.mjs'), CHECKS)
  await writeFile(join(base, 'outside.mjs'), CHECKS)
  await symlink(join(base, 'outside.mjs'), join(root, 'src/link.mjs'))
})
after(async () => {
  await rm(base, { recursive: true, force: true })
})

const model = (
  permissions: Record<string, string>,
  { image = true }: { image?: boolean } = {}
) => {
  const declaration: any = testDeclaration()
  declaration.offering.permissions = permissions
  if (!image) {
    delete declaration.offering.edit.imageKey
    delete declaration.offering.thumbnail
  }
  return buildCollectionsModel({
    declaration,
    tables: testTables(),
    buckets: ['site'],
  })
}

const READ = 'src/checks.mjs#mayRead'
const PLAIN = 'src/checks.mjs#mayWrite'

describe('verifyCollectionChecks', () => {
  test('accepts session checks, and a record check where no upload runs it', async () => {
    await verifyCollectionChecks(
      root,
      model({ read: READ, create: READ, edit: READ })
    )
    await verifyCollectionChecks(
      root,
      model({ read: READ, edit: PLAIN }, { image: false })
    )
  })

  for (const [what, permissions, message] of [
    ['a missing module', { read: 'src/none.mjs#mayRead' }, /there is no file/],
    [
      'a missing export',
      { read: 'src/checks.mjs#none' },
      /exports no check 'none'/,
    ],
    [
      'an export that is no function',
      { read: 'src/checks.mjs#notACheck' },
      /exports no check/,
    ],
    [
      'a read check that is not a pikkuAuth',
      { read: PLAIN },
      /permissions.read: 'mayWrite' must be a pikkuAuth/,
    ],
    [
      'a link that leaves the project',
      { read: 'src/link.mjs#mayRead' },
      /is outside the project/,
    ],
    [
      'a create check an upload cannot run',
      { create: PLAIN },
      /permissions.create: .* must be a pikkuAuth/,
    ],
    [
      'an edit check an upload cannot run',
      { edit: PLAIN },
      /permissions.edit: .* must be a pikkuAuth/,
    ],
  ] as const) {
    test(`refuses ${what}`, async () => {
      await assert.rejects(
        verifyCollectionChecks(root, model(permissions)),
        message
      )
    })
  }
})
