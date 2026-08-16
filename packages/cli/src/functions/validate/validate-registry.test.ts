import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { discoverTargets, planValidation } from './validate-registry.js'

const makeTmp = async () => mkdtemp(join(tmpdir(), 'pikku-validate-plan-'))

const write = async (
  root: string,
  rel: string,
  contents: string
): Promise<void> => {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

/** A publishable addon: generated output, a hand-written types/ beside it. */
const writeAddon = async (root: string, at: string): Promise<void> => {
  await write(
    root,
    join(at, 'package.json'),
    JSON.stringify({ name: at, files: ['dist', '.pikku'] })
  )
  await write(root, join(at, 'pikku.config.json'), '{}')
  await write(root, join(at, 'types/application-types.d.ts'), 'export {}\n')
  await write(root, join(at, '.pikku/pikku-types.gen.ts'), 'export {}\n')
}

const planned = (plan: Awaited<ReturnType<typeof planValidation>>): string[] =>
  plan.map((p) => `${p.check.id}:${p.target.label}`).sort()

describe('target discovery', () => {
  test('finds nested packages and ignores node_modules and dist', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'package.json', '{"name":"root"}')
      await write(tmp, 'packages/a/package.json', '{"name":"a"}')
      await write(tmp, 'packages/group/b/package.json', '{"name":"b"}')
      await write(tmp, 'node_modules/evil/package.json', '{"name":"evil"}')
      await write(tmp, 'packages/a/dist/package.json', '{"name":"dist"}')

      const labels = (await discoverTargets(tmp)).map((t) => t.label).sort()
      assert.deepStrictEqual(labels, ['.', 'packages/a', 'packages/group/b'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('validation planning', () => {
  test('an addon gets the addon check and not the app checks', async () => {
    const tmp = await makeTmp()
    try {
      await writeAddon(tmp, '.')
      assert.deepStrictEqual(planned(await planValidation(tmp)), [
        'addon-package:.',
        'pikku-barrel:.',
        'workspace-exports:.',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('an app project gets the app checks and not the addon check', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'package.json', '{"name":"app"}')
      await write(tmp, 'pikku.config.json', '{}')
      await write(tmp, 'packages/functions/package.json', '{"name":"fns"}')
      assert.deepStrictEqual(planned(await planValidation(tmp)), [
        'app-project:.',
        'pikku-barrel:.',
        'workspace-exports:.',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  /**
   * The shape that makes a single auto-detected mode unworkable: the addons
   * repo is a workspace *and* 217 publishable addons, so the plan has to hold
   * both rather than choose.
   */
  test('a workspace of addons plans one addon check per addon', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'package.json', '{"name":"root","workspaces":["p/**"]}')
      await write(tmp, 'pikku.config.json', '{}')
      await writeAddon(tmp, 'p/one')
      await writeAddon(tmp, 'p/two')

      assert.deepStrictEqual(planned(await planValidation(tmp)), [
        'addon-package:p/one',
        'addon-package:p/two',
        'app-project:.',
        'pikku-barrel:.',
        'pikku-barrel:p/one',
        'pikku-barrel:p/two',
        'workspace-exports:.',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a private addon is not held to the published file set', async () => {
    const tmp = await makeTmp()
    try {
      await writeAddon(tmp, '.')
      await write(
        tmp,
        'package.json',
        JSON.stringify({ name: 'x', private: true, files: ['dist', '.pikku'] })
      )
      assert.deepStrictEqual(planned(await planValidation(tmp)), [
        'pikku-barrel:.',
        'workspace-exports:.',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a plain package plans no package checks', async () => {
    const tmp = await makeTmp()
    try {
      await write(tmp, 'package.json', '{"name":"plain"}')
      assert.deepStrictEqual(planned(await planValidation(tmp)), [
        'workspace-exports:.',
      ])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
