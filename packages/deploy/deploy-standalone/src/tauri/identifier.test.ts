import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  defaultNativeIdentifier,
  nativeIdentifierProblems,
} from './identifier.js'

describe('defaultNativeIdentifier', () => {
  it('borrows the npm scope as the org', () => {
    assert.equal(
      defaultNativeIdentifier('@acme/shop', 'customer'),
      'com.acme.customer'
    )
  })

  it('drops the hyphens Android refuses', () => {
    assert.equal(
      defaultNativeIdentifier('@acme-co/shop', 'driver-app'),
      'com.acmeco.driverapp'
    )
  })

  it('uses an unscoped package name as the org', () => {
    assert.equal(defaultNativeIdentifier('shop', 'pos'), 'com.shop.pos')
  })

  it('never produces a segment Android refuses', () => {
    for (const id of [
      defaultNativeIdentifier('@1password/x', 'new'),
      defaultNativeIdentifier(undefined, '9lives'),
    ]) {
      assert.deepEqual(nativeIdentifierProblems(id), [], id)
    }
  })
})

describe('nativeIdentifierProblems', () => {
  it('accepts a plain reverse-DNS id', () => {
    assert.deepEqual(nativeIdentifierProblems('com.acme.shop'), [])
  })

  for (const [id, reason] of [
    ['com.acme.my-shop', /hyphens/],
    ['com.acme.2shop', /start with a letter/],
    ['com.acme.class', /Java keyword/],
    ['com.acme.shop.app', /macOS/],
    ['shop', /two dot-separated/],
  ] as const) {
    it(`refuses ${id}`, () => {
      assert.match(nativeIdentifierProblems(id).join('\n'), reason)
    })
  }
})
