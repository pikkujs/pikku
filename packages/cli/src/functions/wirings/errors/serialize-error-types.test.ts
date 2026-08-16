import { test, describe } from 'node:test'
import * as assert from 'assert'
import { serializeErrorTypes } from './serialize-error-types.js'

describe('serializeErrorTypes', () => {
  /**
   * The point of the leaf is that an application never names `@pikku/core` —
   * every Pikku import it makes goes through `#pikku/<leaf>`. Errors were the
   * one thing with no leaf to go through.
   */
  test('the error leaf re-exports the core catalogue', () => {
    assert.match(
      serializeErrorTypes(),
      /^export \* from '@pikku\/core\/errors'$/m
    )
  })

  test('the leaf says which specifier resolves to it', () => {
    assert.match(serializeErrorTypes(), /#pikku\/error/)
  })

  /**
   * A re-export and nothing else: there is no project-specific error codegen,
   * so a name appearing here would be one core does not publish.
   */
  test('the leaf adds nothing of its own', () => {
    const declarations = serializeErrorTypes()
      .split('\n')
      .filter((line) => /^\s*(export|import)\b/.test(line))

    assert.deepStrictEqual(declarations, [
      "export * from '@pikku/core/errors'",
    ])
  })
})
