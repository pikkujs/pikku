import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  assignBundlePaths,
  resolveFilteredFunctions,
  type FunctionMetaLike,
} from './addon-filter.js'

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
  listContacts: {
    name: 'listContacts',
    tags: ['hubspot'],
    sourceFile: '/p/src/functions/list-contacts.function.ts',
  },
  stripeWebhook: {
    name: 'stripeWebhook',
    tags: [],
    sourceFile: '/p/src/functions/stripe-webhook.function.ts',
  },
}

describe('resolveFilteredFunctions', () => {
  test('matches by tag (token absent from any name)', () => {
    const { matched } = resolveFilteredFunctions(meta, 'payments')
    assert.deepEqual(
      matched.map((m) => m.id),
      ['refundCharge']
    )
  })

  test('matches by name substring (case-insensitive)', () => {
    const { matched } = resolveFilteredFunctions(meta, 'STRIPE')
    // tag 'stripe' on two + name substring 'stripe' on stripeWebhook
    assert.deepEqual(
      matched.map((m) => m.id).sort(),
      ['createCharge', 'refundCharge', 'stripeWebhook']
    )
  })

  test('supports comma-separated tokens (union)', () => {
    const { matched } = resolveFilteredFunctions(meta, 'hubspot, payments')
    assert.deepEqual(
      matched.map((m) => m.id).sort(),
      ['listContacts', 'refundCharge']
    )
  })

  test('carries through the source file for each match', () => {
    const { matched } = resolveFilteredFunctions(meta, 'hubspot')
    assert.deepEqual(matched, [
      {
        id: 'listContacts',
        name: 'listContacts',
        sourceFile: '/p/src/functions/list-contacts.function.ts',
      },
    ])
  })

  test('skips matches that have no source file', () => {
    const noSource: Record<string, FunctionMetaLike> = {
      ghost: { name: 'ghost', tags: ['stripe'] },
    }
    const { matched, skipped } = resolveFilteredFunctions(noSource, 'stripe')
    assert.deepEqual(matched, [])
    assert.deepEqual(skipped, ['ghost'])
  })

  test('throws on an empty filter', () => {
    assert.throws(() => resolveFilteredFunctions(meta, '  ,  '), /empty/)
  })
})

describe('assignBundlePaths', () => {
  test('places each function under src/functions by basename', () => {
    const bundled = assignBundlePaths([
      { id: 'a', name: 'a', sourceFile: '/p/src/functions/create-charge.function.ts' },
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
