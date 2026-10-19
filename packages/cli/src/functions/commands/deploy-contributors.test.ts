import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDeployContributors } from './deploy-contributors.js'

describe('loadDeployContributors', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-deploy-contributors-'))
    writeFileSync(
      join(root, 'contributors.ts'),
      `export const project = { name: 'project', emit: () => [] }\nexport const addon = { name: 'addon', emit: () => [] }\n`
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('loads deploy.contributors, then the ones addons declare', async () => {
    const loaded = await loadDeployContributors(
      {
        rootDir: root,
        deploy: {
          providers: {},
          contributors: [{ module: './contributors.ts', export: 'project' }],
        },
      },
      {
        addonContributors: {
          cloud: {
            packageName: '@addon/cloud',
            packageDir: root,
            contributors: [{ module: './contributors.ts', export: 'addon' }],
          },
        },
      }
    )
    assert.deepEqual(
      loaded.map((c) => c.name),
      ['project', 'addon']
    )
  })

  test('without either there is nothing to pass', async () => {
    assert.deepEqual(await loadDeployContributors({ rootDir: root }, {}), [])
  })

  test('an addon contributor that does not resolve names the addon', async () => {
    await assert.rejects(
      loadDeployContributors(
        { rootDir: root },
        {
          addonContributors: {
            cloud: {
              packageName: '@addon/cloud',
              packageDir: root,
              contributors: [{ module: '@addon/cloud/missing' }],
            },
          },
        }
      ),
      /addon 'cloud' \(@addon\/cloud\): cannot resolve '@addon\/cloud\/missing'/
    )
  })
})
