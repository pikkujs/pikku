import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSqliteRuntime } from '@pikku/db-migrator/sqlite'
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

test('getColumns ignores SQL comments inside a CHECK enum list', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-sqlite-enum-'))
  const runtime = await loadSqliteRuntime()
  const db = runtime.open(join(dir, 'test.db'))
  try {
    // SQLite stores the CREATE TABLE text verbatim, comments and all, so a
    // comment annotating a value is part of what the parser reads back. An
    // apostrophe in one opens a string that swallows the rest of the list,
    // and a bracket in one closes the list early — either way the constraint
    // survives as a union that is wrong rather than as no union at all.
    db.exec(`CREATE TABLE assessment (
      status TEXT NOT NULL CHECK (status IN (
        'draft',      -- the clinician's working copy
        'submitted',  -- locked (see the report flow)
        'final'
      )),
      band TEXT CHECK (band IN (
        /* scored bands */
        'low',
        'high'
      ))
    )`)
    const cols = await new SqliteIntrospector(db).getColumns('assessment')
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]))
    assert.deepEqual(byName.status.enumValues, ['draft', 'submitted', 'final'])
    assert.deepEqual(byName.band.enumValues, ['low', 'high'])
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
