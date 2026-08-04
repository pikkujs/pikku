import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hashToken,
  unsafeAsHashed,
  unsafeAsSealed,
  unsafeAsWrapped,
} from './column-form.js'
import type {
  HashedValue,
  SealedValue,
  WrappedValue,
} from './data-classification.js'
import { deriveKEK, envelopeEncrypt, envelopeRewrap } from './crypto-utils.js'

const KEY_MATERIAL = 'x'.repeat(32)

describe('hashToken', () => {
  test('is the sha256 of the input, lowercase hex', async () => {
    // Known vector, so a refactor of the hex encoding cannot quietly change
    // what every stored hash in every downstream database means.
    assert.equal(
      await hashToken('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  test('is stable across calls', async () => {
    assert.equal(await hashToken('token'), await hashToken('token'))
  })

  test('separates different inputs', async () => {
    assert.notEqual(await hashToken('a'), await hashToken('b'))
  })
})

describe('the form brands', () => {
  test('a plain string is not assignable to any of them', () => {
    // @ts-expect-error plaintext cannot be written to a wrapped column
    const wrapped: WrappedValue = 'not-ciphertext'
    // @ts-expect-error plaintext cannot be written to a sealed column
    const sealed: SealedValue = 'not-ciphertext'
    // @ts-expect-error a raw token cannot be written where its hash belongs
    const hashed: HashedValue = 'raw-token'
    assert.ok(wrapped && sealed && hashed)
  })

  test('the three do not substitute for one another', () => {
    const wrapped = unsafeAsWrapped('ct')
    // @ts-expect-error a value fabric cannot read is not one it can
    const asWrapped: WrappedValue = unsafeAsSealed('ct')
    // @ts-expect-error a digest is not ciphertext
    const asHashed: HashedValue = wrapped
    assert.ok(asWrapped && asHashed)
  })

  test('but each still widens to string, so reads and query operands are unaffected', () => {
    const asString: string = unsafeAsWrapped('ct')
    assert.equal(asString, 'ct')
    assert.equal(`${unsafeAsHashed('abc')}`, 'abc')
  })
})

describe('the envelope primitives produce the brand', () => {
  test('envelopeEncrypt returns ciphertext that is writable to a wrapped column', async () => {
    const kek = await deriveKEK(KEY_MATERIAL, 'c2FsdA')
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, 'value')
    // No cast: this is the whole mechanism — the only way to satisfy the
    // column type is to have actually encrypted something.
    const forColumn: WrappedValue = ciphertext
    const dekForColumn: WrappedValue = wrappedDEK
    assert.ok(forColumn.length > 0 && dekForColumn.length > 0)
  })

  test('a rewrapped DEK is still writable, so rotation needs no escape hatch', async () => {
    const oldKek = await deriveKEK(KEY_MATERIAL, 'c2FsdA')
    const newKek = await deriveKEK('y'.repeat(32), 'c2FsdA')
    const { wrappedDEK } = await envelopeEncrypt(oldKek, 'value')
    const rewrapped: WrappedValue = await envelopeRewrap(
      oldKek,
      newKek,
      wrappedDEK
    )
    assert.notEqual(rewrapped, wrappedDEK)
  })

  test('decrypting accepts a bare string, so reading a row back needs no cast', async () => {
    const kek = await deriveKEK(KEY_MATERIAL, 'c2FsdA')
    const { ciphertext, wrappedDEK } = await envelopeEncrypt(kek, 'value')
    const { envelopeDecrypt } = await import('./crypto-utils.js')
    const fromRow: string = ciphertext
    assert.equal(
      await envelopeDecrypt<string>(kek, fromRow, wrappedDEK),
      'value'
    )
  })
})
