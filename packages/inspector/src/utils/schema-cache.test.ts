import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readDiskTSSchemas,
  writeDiskTSSchemas,
  type SchemaDep,
} from './schema-generator.js'
import type { InspectorLogger } from '../types.js'

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as InspectorLogger

const KEY = 'test-key'
const SCHEMAS = { Thing: { type: 'object' } }

/** A cache directory and one source file the cached schemas claim to derive from. */
function makeCache(sourceContent: string): {
  cacheDir: string
  source: string
  deps: SchemaDep[]
  cleanup: () => void
} {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-schema-cache-'))
  const source = join(dir, 'thing.ts')
  writeFileSync(source, sourceContent)
  const stat = statSync(source)
  return {
    cacheDir: dir,
    source,
    deps: [{ path: source, mtimeMs: stat.mtimeMs, size: stat.size }],
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

describe('TS schema disk cache', () => {
  test('serves the cached schemas while their sources are untouched', () => {
    const { cacheDir, deps, cleanup } = makeCache('export interface Thing {}')
    try {
      writeDiskTSSchemas(silentLogger, cacheDir, KEY, SCHEMAS, deps)
      const hit = readDiskTSSchemas(silentLogger, cacheDir, KEY)
      assert.deepEqual(hit?.schemas, SCHEMAS)
    } finally {
      cleanup()
    }
  })

  test('discards the cache when a type it was built from changes', () => {
    const { cacheDir, source, deps, cleanup } = makeCache(
      'export interface Thing {}'
    )
    try {
      writeDiskTSSchemas(silentLogger, cacheDir, KEY, SCHEMAS, deps)
      // The shape changes but the name does not, so the cache key — which hashes
      // only the synthesized custom-types source — is identical. This is the case
      // that used to serve a stale schema, and it survived `rm -rf .pikku`
      // because the cache lives under node_modules/.cache.
      writeFileSync(source, 'export interface Thing { added: string }')
      assert.equal(readDiskTSSchemas(silentLogger, cacheDir, KEY), null)
    } finally {
      cleanup()
    }
  })

  test('discards the cache when a source is rewritten to the same size', () => {
    const { cacheDir, source, deps, cleanup } = makeCache('export type A = 1')
    try {
      writeDiskTSSchemas(silentLogger, cacheDir, KEY, SCHEMAS, deps)
      // Same byte count, different type: size alone would call this unchanged, so
      // the mtime half of the fingerprint is what has to catch it.
      writeFileSync(source, 'export type A = 2')
      utimesSync(source, new Date(), new Date(Date.now() + 5000))
      assert.equal(readDiskTSSchemas(silentLogger, cacheDir, KEY), null)
    } finally {
      cleanup()
    }
  })

  test('discards the cache when a source it was built from is deleted', () => {
    const { cacheDir, source, deps, cleanup } = makeCache('export type A = 1')
    try {
      writeDiskTSSchemas(silentLogger, cacheDir, KEY, SCHEMAS, deps)
      rmSync(source)
      assert.equal(readDiskTSSchemas(silentLogger, cacheDir, KEY), null)
    } finally {
      cleanup()
    }
  })

  test('discards a cache written before deps were tracked', () => {
    const { cacheDir, cleanup } = makeCache('export type A = 1')
    try {
      writeFileSync(
        join(cacheDir, 'ts-schemas.json'),
        JSON.stringify({ key: KEY, schemas: SCHEMAS })
      )
      assert.equal(readDiskTSSchemas(silentLogger, cacheDir, KEY), null)
    } finally {
      cleanup()
    }
  })

  test('still misses on a different key', () => {
    const { cacheDir, deps, cleanup } = makeCache('export type A = 1')
    try {
      writeDiskTSSchemas(silentLogger, cacheDir, KEY, SCHEMAS, deps)
      assert.equal(readDiskTSSchemas(silentLogger, cacheDir, 'other'), null)
    } finally {
      cleanup()
    }
  })
})
