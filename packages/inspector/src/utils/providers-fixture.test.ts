import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '../../../..')
const goRoot = join(repo, 'packages/inspector-go/testdata/providers')
const parityRoot = join(repo, 'inspector-parity/fixtures/providers')
const goFixture = join(goRoot, 'src')
const parityFixture = join(parityRoot, 'src')
const standIn = 'pikku-core-provider.d.ts'

describe('the providers inspector fixtures', () => {
  test('no source takes its service keys from core types that only exist once core is built', async () => {
    for (const dir of [goFixture, parityFixture]) {
      for (const name of await readdir(dir)) {
        const source = await readFile(join(dir, name), 'utf8')
        assert.doesNotMatch(source, /from '@pikku\/core\/types'/, name)
      }
    }
  })

  test('every @pikku/core import resolves through the fixture stand-in, not a built core', async () => {
    for (const root of [goRoot, parityRoot]) {
      const tsconfig = JSON.parse(
        await readFile(join(root, 'tsconfig.json'), 'utf8')
      )
      assert.deepEqual(tsconfig.compilerOptions.paths, {
        '@pikku/core/provider': [`./${standIn}`],
      })
      for (const name of await readdir(join(root, 'src'))) {
        const source = await readFile(join(root, 'src', name), 'utf8')
        for (const [, specifier] of source.matchAll(
          /from '(@pikku\/core[^']*)'/g
        )) {
          assert.equal(specifier, '@pikku/core/provider', name)
        }
      }
    }
    assert.equal(
      await readFile(join(goRoot, standIn), 'utf8'),
      await readFile(join(parityRoot, standIn), 'utf8')
    )
  })
})
