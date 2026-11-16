import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { TablesDeclaration } from '@pikku/core/db'
import { declaredConstraints } from './sqlite-constraint-notice.js'

test('a name with consecutive capitals is the column the database holds', () => {
  const tables: TablesDeclaration = {
    HTTPLog: {
      columns: { statusHTTPCode: { type: 'integer', min: 100 } },
    },
  }
  const [found] = declaredConstraints(tables)
  assert.equal(found!.table, 'httplog')
  assert.equal(found!.column, 'status_httpcode')
  assert.equal(found!.where, 'httplog.status_httpcode')
  assert.match(found!.check, /"status_httpcode"/)
})
