import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runCrudRoleChecks } from './crud-role-checks.js'
import { crudTempDir } from '../../../test-fixtures/crud/temp-dir.js'

const roots: string[] = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

const project = async (roles?: Record<string, { scopes: string[] }>) => {
  const root = await crudTempDir('pikku-crud-roles-')
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

describe('crud system role check', () => {
  test('warns for a system role holding all of CRUD', async () => {
    const root = await project({
      owner: { scopes: ['crud'] },
      lead: { scopes: ['admin', 'crud:*'] },
      editor: { scopes: ['crud:offering', 'crud:offering:read', 'crudExport'] },
    })

    const findings = await runCrudRoleChecks(root)
    assert.deepEqual(
      findings.map((f) => [f.severity, f.message.match(/'(\w+)'/)![1]]),
      [
        ['warn', 'owner'],
        ['warn', 'lead'],
      ]
    )
  })

  test('says nothing for a project with no roles', async () => {
    assert.deepEqual(await runCrudRoleChecks(await project()), [])
  })
})
