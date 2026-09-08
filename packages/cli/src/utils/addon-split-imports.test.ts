import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveSplitAddonImports } from './addon-split-imports.js'

const PACKAGE_NAME = '@pikku/addon-fixture'

/**
 * A consumer project with the addon installed, laid out the way an addon
 * publishes: the generated tree under `dist/.pikku/addon`, reachable through a
 * `./.pikku/*` wildcard in the exports map.
 */
const createProject = async (files: string[]) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-addon-split-'))
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'consumer', type: 'module' })
  )
  const packageDir = join(root, 'node_modules', PACKAGE_NAME)
  const addonDir = join(packageDir, 'dist', '.pikku', 'addon')
  await mkdir(join(addonDir, 'function', 'single'), { recursive: true })
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: PACKAGE_NAME,
      type: 'module',
      exports: {
        '.': './dist/.pikku/addon/pikku-bootstrap.gen.js',
        './.pikku/*': './dist/.pikku/addon/*',
      },
    })
  )
  for (const file of files) {
    await writeFile(join(addonDir, file), '')
  }
  return root
}

describe('resolveSplitAddonImports', () => {
  const roots: string[] = []

  const project = async (files: string[]) => {
    const root = await createProject(files)
    roots.push(root)
    return root
  }

  after(async () => {
    for (const root of roots) {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('returns the shared bootstrap plus one file per named function', async () => {
    const root = await project([
      'pikku-bootstrap.gen.js',
      'pikku-bootstrap-shared.gen.js',
      'function/single/runSecurityAudit.gen.js',
      'function/single/installAddon.gen.js',
    ])
    assert.deepEqual(
      resolveSplitAddonImports(root, PACKAGE_NAME, [
        'runSecurityAudit',
        'installAddon',
      ]),
      [
        `${PACKAGE_NAME}/.pikku/pikku-bootstrap-shared.gen.js`,
        `${PACKAGE_NAME}/.pikku/function/single/runSecurityAudit.gen.js`,
        `${PACKAGE_NAME}/.pikku/function/single/installAddon.gen.js`,
      ]
    )
  })

  test('returns null for an addon built before the split files existed', async () => {
    const root = await project(['pikku-bootstrap.gen.js'])
    assert.equal(
      resolveSplitAddonImports(root, PACKAGE_NAME, ['runSecurityAudit']),
      null
    )
  })

  test('returns null when one of the named functions has no file', async () => {
    const root = await project([
      'pikku-bootstrap.gen.js',
      'pikku-bootstrap-shared.gen.js',
      'function/single/runSecurityAudit.gen.js',
    ])
    assert.equal(
      resolveSplitAddonImports(root, PACKAGE_NAME, [
        'runSecurityAudit',
        'installAddon',
      ]),
      null
    )
  })

  test('returns null when no functions were named', async () => {
    const root = await project([
      'pikku-bootstrap.gen.js',
      'pikku-bootstrap-shared.gen.js',
    ])
    assert.equal(resolveSplitAddonImports(root, PACKAGE_NAME, []), null)
  })
})
