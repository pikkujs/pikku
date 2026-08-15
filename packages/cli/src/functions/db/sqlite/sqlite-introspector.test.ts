import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSqliteRuntime } from './sqlite-runtime.js'
import { SqliteIntrospector } from './sqlite-introspector.js'

test('getColumns derives enumValues from CHECK (col IN (…)) constraints', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-sqlite-enum-'))
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(join(dir, 'test.db'))
  try {
    db.exec(`CREATE TABLE booking (
      booking_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('enquiry', 'reserved', 'confirmed')),
      kind TEXT CHECK ("kind" IN ('deposit', 'final')),
      note TEXT
    )`)
    const cols = await new SqliteIntrospector(db).getColumns('booking')
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]))

    // column-level CHECK, bare and quoted column references both parse
    assert.deepEqual(byName.status.enumValues, [
      'enquiry',
      'reserved',
      'confirmed',
    ])
    assert.deepEqual(byName.kind.enumValues, ['deposit', 'final'])
    // no CHECK → stays a plain column
    assert.equal(byName.note.enumValues, undefined)
    assert.equal(byName.booking_id.enumValues, undefined)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('getColumns unescapes doubled single-quotes in CHECK enum values', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-sqlite-enum-'))
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(join(dir, 'test.db'))
  try {
    db.exec(`CREATE TABLE t (v TEXT CHECK (v IN ('a''b', 'plain')))`)
    const cols = await new SqliteIntrospector(db).getColumns('t')
    assert.deepEqual(cols.find((c) => c.name === 'v')?.enumValues, [
      "a'b",
      'plain',
    ])
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
