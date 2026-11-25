import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '../../../..')
const goFixture = join(repo, 'packages/inspector-go/testdata/providers/src')
const parityFixture = join(repo, 'inspector-parity/fixtures/providers/src')

describe('the providers inspector fixtures', () => {
  test('no source takes its service keys from core types that only exist once core is built', async () => {
    for (const dir of [goFixture, parityFixture]) {
      for (const name of await readdir(dir)) {
        const source = await readFile(join(dir, name), 'utf8')
        assert.doesNotMatch(source, /from '@pikku\/core\/types'/, name)
      }
    }
  })
})
