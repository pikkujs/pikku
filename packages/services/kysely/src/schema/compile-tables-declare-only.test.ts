import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { TablesDeclaration } from '@pikku/core/db'
import { compileTables, tableRequirements } from './index.js'

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

  test('a declareOnly column may leave its type to the database', () => {
    assert.equal(
      compileTables({
        account: { declareOnly: true, columns: { id: { primaryKey: true } } },
      }).length,
      0
    )
  })

  test('a column pointing at an untyped declareOnly column takes its type from the database', () => {
    const typeless: TablesDeclaration = {
      account: { declareOnly: true, columns: { id: { primaryKey: true } } },
      note: {
        columns: {
          id: { type: 'key', primaryKey: true },
          accountId: { references: 'account.id' },
        },
      },
    }
    assert.deepEqual(tableRequirements(typeless, 'tables'), [
      { table: 'account', column: 'id', owner: 'tables' },
    ])
  })

  test('a managed column still needs a type or a reference', () => {
    assert.throws(
      () => compileTables({ note: { columns: { body: {} } } } as never),
      /'note.body' has no type/
    )
  })
})
