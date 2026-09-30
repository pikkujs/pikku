import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { addonResolutionDirs } from './addon-resolution.js'

const makeRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-addon-resolution-'))
  await writeFile(join(root, 'package.json'), '{}')
  return root
}

describe('addonResolutionDirs', () => {
  test('resolves a relative declaring file to an absolute package dir', async () => {
    const root = await makeRoot()
    try {
      const member = join(root, 'packages', 'functions')
      await mkdir(join(member, 'src'), { recursive: true })
      await writeFile(join(member, 'package.json'), '{}')
      const file = join(member, 'src', 'addons.wiring.ts')

      // Relative on purpose: `createRequire` rejects a relative directory, so
      // the declaring file has to be resolved before its package is found.
      assert.deepEqual(addonResolutionDirs(root, relative(process.cwd(), file)), [
        member,
        root,
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('falls back to the root when there is no declaring file', async () => {
    const root = await makeRoot()
    try {
      assert.deepEqual(addonResolutionDirs(root), [root])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
