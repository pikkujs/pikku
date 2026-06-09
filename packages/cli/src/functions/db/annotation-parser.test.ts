import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadAnnotations, parseAnnotations } from './annotation-parser.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-ann-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

// ── loadAnnotations: sidecar ─────────────────────────────────────────────────

test('loadAnnotations returns {} when neither sidecar nor migrationsDir given', () => {
  assert.deepEqual(loadAnnotations(root), {})
})

test('loadAnnotations reads db/annotations.gen.json when present', () => {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'annotations.gen.json'),
    JSON.stringify({
      user: {
        email: { visibility: 'private', classification: 'pii' },
        name: { visibility: 'private', classification: 'pii' },
        image: { visibility: 'private' },
      },
      api_token: {
        token_hash: { visibility: 'secret', classification: 'hash' },
      },
      organization: {
        name: { visibility: 'public' },
        slug: { visibility: 'public' },
      },
    })
  )

  const result = loadAnnotations(root)
  assert.deepEqual(result.user?.email, { classification: 'private' })
  assert.deepEqual(result.user?.name, { classification: 'private' })
  assert.deepEqual(result.user?.image, { classification: 'private' })
  assert.deepEqual(result.api_token?.token_hash, { classification: 'secret' })
  assert.deepEqual(result.organization?.name, { classification: 'public' })
  assert.deepEqual(result.organization?.slug, { classification: 'public' })
})

test('loadAnnotations maps kind from sidecar', () => {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'annotations.gen.json'),
    JSON.stringify({
      event: {
        occurred_at: { visibility: 'public', kind: 'date' },
        payload: { visibility: 'private', kind: 'json', tsType: 'Record<string,unknown>' },
        active: { visibility: 'public', kind: 'bool' },
      },
    })
  )

  const result = loadAnnotations(root)
  assert.deepEqual(result.event?.occurred_at, { classification: 'public', kind: 'date' })
  assert.deepEqual(result.event?.payload, { classification: 'private', kind: 'json', tsType: 'Record<string,unknown>' })
  assert.deepEqual(result.event?.active, { classification: 'public', kind: 'bool' })
})

test('loadAnnotations ignores unknown visibility values', () => {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'annotations.gen.json'),
    JSON.stringify({
      foo: {
        bar: { visibility: 'unknown-value' },
        baz: { visibility: 'public' },
      },
    })
  )

  const result = loadAnnotations(root)
  // bar has unknown visibility — entry still created but classification omitted
  assert.ok(!result.foo?.bar?.classification)
  assert.deepEqual(result.foo?.baz, { classification: 'public' })
})

test('loadAnnotations returns {} when sidecar JSON is malformed', () => {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(join(root, 'db', 'annotations.gen.json'), 'not json {{{')

  // Falls back to no annotations (no migrationsDir given)
  const result = loadAnnotations(root)
  assert.deepEqual(result, {})
})

// ── loadAnnotations: sidecar preferred over SQL fallback ─────────────────────

test('loadAnnotations prefers sidecar over SQL migrations when both exist', () => {
  mkdirSync(join(root, 'db', 'sqlite'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'sqlite', '0001-init.sql'),
    `CREATE TABLE todos (
  id INTEGER PRIMARY KEY,
  done INTEGER NOT NULL DEFAULT 0 -- @bool
);`
  )
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'annotations.gen.json'),
    JSON.stringify({ todos: { done: { visibility: 'public', kind: 'bool' } } })
  )

  const result = loadAnnotations(root, join(root, 'db', 'sqlite'))
  // Sidecar wins — classification comes from sidecar, not SQL fallback
  assert.deepEqual(result.todos?.done, { classification: 'public', kind: 'bool' })
})

// ── parseAnnotations: SQL fallback ───────────────────────────────────────────

test('parseAnnotations returns {} for empty migrations dir', () => {
  mkdirSync(join(root, 'db', 'sqlite'), { recursive: true })
  assert.deepEqual(parseAnnotations(join(root, 'db', 'sqlite')), {})
})

test('parseAnnotations returns {} for non-existent dir', () => {
  assert.deepEqual(parseAnnotations(join(root, 'does-not-exist')), {})
})

test('parseAnnotations extracts @bool annotation from CREATE TABLE', () => {
  const dir = join(root, 'db', 'sqlite')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '0001-init.sql'),
    `CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  done INTEGER NOT NULL DEFAULT 0 -- @bool
);`
  )
  const result = parseAnnotations(dir)
  assert.deepEqual(result.tasks?.done, { kind: 'bool' })
})

test('parseAnnotations extracts @date annotation from CREATE TABLE', () => {
  const dir = join(root, 'db', 'sqlite')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '0001-init.sql'),
    `CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL -- @date
);`
  )
  const result = parseAnnotations(dir)
  assert.deepEqual(result.events?.occurred_at, { kind: 'date' })
})

test('parseAnnotations extracts @json annotation with type from CREATE TABLE', () => {
  const dir = join(root, 'db', 'sqlite')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '0001-init.sql'),
    `CREATE TABLE docs (
  id INTEGER PRIMARY KEY,
  meta TEXT -- @json Record<string,unknown>
);`
  )
  const result = parseAnnotations(dir)
  assert.deepEqual(result.docs?.meta, { kind: 'json', tsType: 'Record<string,unknown>' })
})

test('parseAnnotations extracts @private classification', () => {
  const dir = join(root, 'db', 'sqlite')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '0001-init.sql'),
    `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL -- @private
);`
  )
  const result = parseAnnotations(dir)
  assert.deepEqual(result.users?.email, { classification: 'private' })
})

test('parseAnnotations extracts @secret classification', () => {
  const dir = join(root, 'db', 'sqlite')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '0001-init.sql'),
    `CREATE TABLE tokens (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL -- @secret
);`
  )
  const result = parseAnnotations(dir)
  assert.deepEqual(result.tokens?.token_hash, { classification: 'secret' })
})

test('parseAnnotations merges annotations across multiple migration files', () => {
  const dir = join(root, 'db', 'sqlite')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '0001-users.sql'),
    `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL -- @private
);`
  )
  writeFileSync(
    join(dir, '0002-tokens.sql'),
    `CREATE TABLE tokens (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL -- @secret
);`
  )

  const result = parseAnnotations(dir)
  assert.deepEqual(result.users?.email, { classification: 'private' })
  assert.deepEqual(result.tokens?.hash, { classification: 'secret' })
})

test('parseAnnotations later migration overrides earlier for same column', () => {
  const dir = join(root, 'db', 'sqlite')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '0001-init.sql'),
    `CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  flag INTEGER NOT NULL -- @bool
);`
  )
  // Second migration re-adds the column with a different annotation (ALTER TABLE)
  writeFileSync(
    join(dir, '0002-alter.sql'),
    `ALTER TABLE items ADD COLUMN flag2 INTEGER NOT NULL; -- @private`
  )

  const result = parseAnnotations(dir)
  assert.deepEqual(result.items?.flag, { kind: 'bool' })
  assert.deepEqual(result.items?.flag2, { classification: 'private' })
})
