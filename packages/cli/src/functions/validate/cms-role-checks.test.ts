import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runCmsRoleChecks } from './cms-role-checks.js'
import { cmsTempDir } from '../../../test-fixtures/cms/temp-dir.js'

const roots: string[] = []
after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})

const project = async (roles?: Record<string, { scopes: string[] }>) => {
  const root = await cmsTempDir('pikku-cms-roles-')
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

describe('cms system role check', () => {
  test('warns for a system role holding the whole CMS', async () => {
    const root = await project({
      owner: { scopes: ['cms'] },
      lead: { scopes: ['admin', 'cms:*'] },
      editor: { scopes: ['cms:offering', 'cms:offering:read', 'cmsExport'] },
    })

    const findings = await runCmsRoleChecks(root)
    assert.deepEqual(
      findings.map((f) => [f.severity, f.message.match(/'(\w+)'/)![1]]),
      [
        ['warn', 'owner'],
        ['warn', 'lead'],
      ]
    )
  })

  test('says nothing for a project with no roles', async () => {
    assert.deepEqual(await runCmsRoleChecks(await project()), [])
  })
})
