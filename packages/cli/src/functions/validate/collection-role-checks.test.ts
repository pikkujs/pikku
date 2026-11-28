import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runCollectionRoleChecks } from './collection-role-checks.js'
import { collectionTempDir } from '../../../test-fixtures/collections/temp-dir.js'

const roots: string[] = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

const project = async (roles?: Record<string, { scopes: string[] }>) => {
  const root = await collectionTempDir('pikku-collection-roles-')
  roots.push(root)
  if (roles) {
    await mkdir(join(root, '.pikku/scopes'), { recursive: true })
    await writeFile(
      join(root, '.pikku/scopes/pikku-roles-meta.gen.json'),
      JSON.stringify(roles)
    )
  }
  return root
}

describe('collections system role check', () => {
  test('warns for a system role holding all of collections', async () => {
    const root = await project({
      owner: { scopes: ['collections'] },
      lead: { scopes: ['admin', 'collections:*'] },
      editor: {
        scopes: [
          'collections:offering',
          'collections:offering:read',
          'collectionExport',
        ],
      },
    })

    const findings = await runCollectionRoleChecks(root)
    assert.deepEqual(
      findings.map((f) => [f.severity, f.message.match(/'(\w+)'/)![1]]),
      [
        ['warn', 'owner'],
        ['warn', 'lead'],
      ]
    )
  })

  test('says nothing for a project with no roles', async () => {
    assert.deepEqual(await runCollectionRoleChecks(await project()), [])
  })
})
