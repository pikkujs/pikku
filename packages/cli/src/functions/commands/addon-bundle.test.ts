import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  assignBundlePaths,
  selectBundledFunctions,
  type FunctionMetaLike,
} from './addon-bundle.js'

const meta: Record<string, FunctionMetaLike> = {
  createCharge: {
    name: 'createCharge',
    tags: ['stripe'],
    sourceFile: '/p/src/functions/create-charge.function.ts',
  },
  refundCharge: {
    name: 'refundCharge',
    tags: ['stripe', 'payments'],
    sourceFile: '/p/src/functions/refund-charge.function.ts',
  },
}

describe('selectBundledFunctions', () => {
  test('bundles every function in the (already-filtered) meta', () => {
    const { matched } = selectBundledFunctions(meta)
    assert.deepEqual(
      matched.map((m) => m.id),
      ['createCharge', 'refundCharge']
    )
  })

  test('carries through id, name and source file', () => {
    const { matched } = selectBundledFunctions({
      listContacts: {
        name: 'listContacts',
        sourceFile: '/p/src/functions/list-contacts.function.ts',
      },
    })
    assert.deepEqual(matched, [
      {
        id: 'listContacts',
        name: 'listContacts',
        sourceFile: '/p/src/functions/list-contacts.function.ts',
      },
    ])
  })

  test('skips entries without a source file (can not be copied)', () => {
    const { matched, skipped } = selectBundledFunctions({
      ghost: { name: 'ghost', tags: ['stripe'] },
    })
    assert.deepEqual(matched, [])
    assert.deepEqual(skipped, ['ghost'])
  })
})

describe('assignBundlePaths', () => {
  test('places each function under src/functions by basename', () => {
    const bundled = assignBundlePaths([
      {
        id: 'a',
        name: 'a',
        sourceFile: '/p/src/functions/create-charge.function.ts',
      },
      { id: 'b', name: 'b', sourceFile: '/p/src/functions/refund.function.ts' },
    ])
    assert.deepEqual(bundled, [
      {
        destPath: 'src/functions/create-charge.function.ts',
        sourceFile: '/p/src/functions/create-charge.function.ts',
      },
      {
        destPath: 'src/functions/refund.function.ts',
        sourceFile: '/p/src/functions/refund.function.ts',
      },
    ])
  })

  test('disambiguates colliding basenames instead of overwriting', () => {
    const bundled = assignBundlePaths([
      { id: 'a', name: 'a', sourceFile: '/p/stripe/charge.function.ts' },
      { id: 'b', name: 'b', sourceFile: '/p/legacy/charge.function.ts' },
    ])
    assert.deepEqual(
      bundled.map((b) => b.destPath),
      ['src/functions/charge.function.ts', 'src/functions/charge-2.function.ts']
    )
  })
})
