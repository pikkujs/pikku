import { test, describe } from 'node:test'
import * as assert from 'assert'
import { serializeLeafIndex } from './serialize-leaf-index.js'

describe('serializeLeafIndex', () => {
  test('re-exports a single entry', () => {
    const index = serializeLeafIndex('http', ['./pikku-http-types.gen.js'])
    assert.match(index, /export \* from '\.\/pikku-http-types\.gen\.js'/)
  })

  test('names the leaf it is the entry for', () => {
    const index = serializeLeafIndex('http', ['./pikku-http-types.gen.js'])
    assert.match(index, /`?#pikku\/http`? resolves here/)
  })

  /**
   * The definer and the typed-service map are generated into separate files.
   * An index that re-exported only one of them would leave the other reachable
   * solely by a relative path into `.pikku`, which is the import the leaves
   * exist to replace.
   */
  test('re-exports every entry a leaf has', () => {
    const index = serializeLeafIndex('credentials', [
      './pikku-credential-types.gen.js',
      './pikku-credentials.gen.js',
    ])
    assert.match(index, /export \* from '\.\/pikku-credential-types\.gen\.js'/)
    assert.match(index, /export \* from '\.\/pikku-credentials\.gen\.js'/)
  })
})
