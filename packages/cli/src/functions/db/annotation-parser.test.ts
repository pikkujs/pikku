import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadAnnotations, nameSuggestsKind } from './annotation-parser.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-ann-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeSidecar(value: unknown): void {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(
    join(root, 'db', 'annotations.gen.json'),
    JSON.stringify(value)
  )
}

// ── loadAnnotations: db/annotations.gen.json sidecar ─────────────────────────

test('loadAnnotations returns {} when the sidecar is absent', () => {
  assert.deepEqual(loadAnnotations(root), {})
})

test('loadAnnotations maps the authored `security` level to classification', () => {
  // Authored ColumnEntry uses `security` for the level and `classification`
  // for the anonymize strategy (compiled verbatim from db/annotations.ts).
  writeSidecar({
    user: {
      email: { security: 'private', classification: 'fake:email' },
      image: { security: 'private' },
    },
    api_token: {
      token_hash: { security: 'secret', classification: 'hash' },
    },
    organization: {
      name: { security: 'public' },
    },
  })

  const result = loadAnnotations(root)
  assert.deepEqual(result.user?.email, {
    classification: 'private',
    anonymize: 'fake:email',
  })
  assert.deepEqual(result.user?.image, { classification: 'private' })
  assert.deepEqual(result.api_token?.token_hash, {
    classification: 'secret',
    anonymize: 'hash',
  })
  assert.deepEqual(result.organization?.name, { classification: 'public' })
})

test('loadAnnotations maps pii and treats encrypted as secret', () => {
  writeSidecar({
    person: {
      ssn: { security: 'pii' },
      card: { security: 'encrypted' },
    },
  })

  const result = loadAnnotations(root)
  assert.deepEqual(result.person?.ssn, { classification: 'pii' })
  // `encrypted` is secret-grade for branding purposes.
  assert.deepEqual(result.person?.card, { classification: 'secret' })
})

test('loadAnnotations maps kind and tsType', () => {
  writeSidecar({
    event: {
      occurred_at: { security: 'public', kind: 'date' },
      payload: {
        security: 'private',
        kind: 'json',
        tsType: 'Record<string,unknown>',
      },
      active: { security: 'public', kind: 'bool' },
      tags: { security: 'public', tsType: 'string[]' },
    },
  })

  const result = loadAnnotations(root)
  assert.deepEqual(result.event?.occurred_at, {
    classification: 'public',
    kind: 'date',
  })
  assert.deepEqual(result.event?.payload, {
    classification: 'private',
    kind: 'json',
    tsType: 'Record<string,unknown>',
  })
  assert.deepEqual(result.event?.active, {
    classification: 'public',
    kind: 'bool',
  })
  assert.deepEqual(result.event?.tags, {
    classification: 'public',
    tsType: 'string[]',
  })
})

test('loadAnnotations ignores unknown security and strategy values', () => {
  writeSidecar({
    foo: {
      bar: { security: 'unknown-value', classification: 'not-a-strategy' },
      baz: { security: 'public' },
    },
  })

  const result = loadAnnotations(root)
  // Unknown security → no classification; unknown strategy → no anonymize.
  assert.ok(!result.foo?.bar?.classification)
  assert.ok(!result.foo?.bar?.anonymize)
  assert.deepEqual(result.foo?.baz, { classification: 'public' })
})

test('loadAnnotations returns {} when the sidecar JSON is malformed', () => {
  mkdirSync(join(root, 'db'), { recursive: true })
  writeFileSync(join(root, 'db', 'annotations.gen.json'), 'not json {{{')
  assert.deepEqual(loadAnnotations(root), {})
})

// ── nameSuggestsKind: warn-only naming heuristic ─────────────────────────────

test('nameSuggestsKind detects date-like and bool-like names', () => {
  assert.equal(nameSuggestsKind('created_at'), 'date')
  assert.equal(nameSuggestsKind('updated_on'), 'date')
  assert.equal(nameSuggestsKind('is_active'), 'bool')
  assert.equal(nameSuggestsKind('has_paid'), 'bool')
  assert.equal(nameSuggestsKind('can_edit'), 'bool')
})

test('nameSuggestsKind returns null for ordinary names', () => {
  assert.equal(nameSuggestsKind('email'), null)
  assert.equal(nameSuggestsKind('name'), null)
  assert.equal(nameSuggestsKind('status'), null)
})
