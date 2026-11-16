import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { TablesDeclaration } from '@pikku/core/db'
import { compileTables } from './index.js'

const tables: TablesDeclaration = {
  account: {
    declareOnly: true,
    columns: { id: { type: 'key', primaryKey: true } },
    indexes: [{ columns: ['id'] }],
  },
  note: {
    columns: {
      id: { type: 'key', primaryKey: true },
      accountId: { type: 'key', references: 'account.id' },
    },
  },
}

describe('compileTables: declareOnly', () => {
  test('emits nothing for a declareOnly table, and still resolves references to it', () => {
    // one create table + no indexes: the account table and its index are skipped
    assert.equal(compileTables(tables).length, 1)
  })

  test('still validates a declareOnly table', () => {
    assert.throws(
      () =>
        compileTables({
          account: {
            declareOnly: true,
            columns: { id: { type: 'key' } },
            primaryKey: ['nope'],
          },
        }),
      /nope/
    )
  })
})
