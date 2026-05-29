import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { filterInternalRPCMeta } from './pikku-command-rpc.js'

describe('filterInternalRPCMeta', () => {
  test('keeps unversioned aliases when the target versioned function survives', () => {
    const result = filterInternalRPCMeta(
      {
        listCards: 'listCards@v2',
        'listCards@v2': 'listCards@v2',
        createCard: 'createCard@v2',
        'createCard@v2': 'createCard@v2',
        missingAlias: 'missing@v2',
      },
      {
        'listCards@v2': {},
        'createCard@v2': {},
      }
    )

    assert.deepEqual(result, {
      listCards: 'listCards@v2',
      'listCards@v2': 'listCards@v2',
      createCard: 'createCard@v2',
      'createCard@v2': 'createCard@v2',
    })
  })
})
