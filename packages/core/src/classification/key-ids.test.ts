import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { ClassificationManifest } from './data-classification.js'
import { DEFAULT_KEY_ID, keyIdsFromManifest } from './key-ids.js'

const manifest = (
  tables: ClassificationManifest['tables']
): ClassificationManifest => ({ version: 1, tables })

describe('keyIdsFromManifest', () => {
  test('a manifest with nothing to encrypt needs no keys', () => {
    const keyIds = keyIdsFromManifest(
      manifest({
        user: {
          email: { classification: 'pii', anonymize_strategy: 'mask' },
          api_token: {
            classification: 'secret',
            anonymize_strategy: 'redact',
            form: 'hashed',
          },
        },
      })
    )

    // A hash is a lookup key, not ciphertext — encrypting it would break the
    // lookup it exists for, so it never contributes a keyId.
    assert.deepEqual(keyIds, [])
  })

  test('a wrapped column with no keyId of its own falls to the default', () => {
    const keyIds = keyIdsFromManifest(
      manifest({
        note: {
          body: {
            classification: 'private',
            anonymize_strategy: 'redact',
            form: 'wrapped',
          },
        },
      })
    )

    assert.deepEqual(keyIds, [DEFAULT_KEY_ID])
  })

  test('every named key is collected once, in a stable order', () => {
    // Feeding this straight to initialize() is the point: a keyId a column
    // names but nobody initialized fails at the first write to that column,
    // which may be a long way from the deploy that introduced it.
    const keyIds = keyIdsFromManifest(
      manifest({
        note: {
          body: {
            classification: 'private',
            anonymize_strategy: 'redact',
            form: 'wrapped',
            keyId: 'notes',
          },
          title: {
            classification: 'private',
            anonymize_strategy: 'redact',
            form: 'wrapped',
            keyId: 'notes',
          },
        },
        credential: {
          token: {
            classification: 'secret',
            anonymize_strategy: 'redact',
            form: 'sealed',
            keyId: 'credentials',
          },
          scope: { classification: 'public', anonymize_strategy: 'none' },
        },
        session: {
          data: {
            classification: 'private',
            anonymize_strategy: 'redact',
            form: 'wrapped',
          },
        },
      })
    )

    assert.deepEqual(keyIds, ['credentials', 'default', 'notes'])
  })
})
