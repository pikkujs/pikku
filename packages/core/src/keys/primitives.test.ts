import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DomainPolicyError } from '../wirings/keypair/index.js'
import {
  fromBase64,
  fromCanonicalBase64Url,
  pkcs8Bytes,
  toBase64,
  toBase64Url,
} from './base64.js'
import { assertDomain, prefixWithDomain } from './domain.js'
describe('base64', () => {
  test('round trips; the canonical form accepts only the unpadded base64url encoding', () => {
    const bytes = Uint8Array.from([251, 255, 0, 1, 2, 250])
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes)
    assert.deepEqual(fromCanonicalBase64Url(toBase64Url(bytes)), bytes)
    assert.throws(() => fromBase64('not base64 !!'))
    assert.equal(
      fromCanonicalBase64Url(toBase64(bytes)),
      undefined,
      'padded standard'
    )
    assert.equal(fromCanonicalBase64Url('-_8AAQ='), undefined, 'padded')
    assert.equal(fromCanonicalBase64Url('-_8AAR'), undefined, 'trailing bits')
    assert.equal(fromCanonicalBase64Url(''), undefined)
  })
})

describe('domain prefix', () => {
  test('is utf8(domain) || 0x00 || data', () => {
    const out = prefixWithDomain('audit-v1', 'hi')
    assert.deepEqual([...out], [...Buffer.from('audit-v1\u0000hi')])
  })
  test('refuses an empty domain or one containing NUL', () => {
    assert.throws(() => assertDomain(''), DomainPolicyError)
    assert.throws(() => assertDomain('a\u0000b'), DomainPolicyError)
    assert.throws(() => assertDomain(undefined), DomainPolicyError)
  })
  test('different domains give different bytes, so one cannot stand in for the other', () => {
    assert.notDeepEqual(prefixWithDomain('a', 'x'), prefixWithDomain('b', 'x'))
    assert.notDeepEqual(
      prefixWithDomain('a', 'bx'),
      prefixWithDomain('ab', 'x')
    )
  })
})

describe('runtime neutrality', () => {
  test('the root entry graph imports no node: module (the file subpath is the only place)', () => {
    const dir = new URL('.', import.meta.url).pathname
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
    )
    assert.ok(files.includes('index.ts'))
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8')
      assert.doesNotMatch(text, /from\s+['"]node:/, file)
      assert.doesNotMatch(text, /require\(/, file)
      assert.doesNotMatch(text, /\bBuffer\b/, file)
      assert.doesNotMatch(text, /\bprocess\./, file)
    }
  })

  test('no key module computes a hash or touches crypto: the provider owns all of it', () => {
    const dir = new URL('.', import.meta.url).pathname
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
    )) {
      const text = readFileSync(join(dir, file), 'utf8')
      assert.doesNotMatch(text, /crypto\.subtle|getRandomValues/, file)
      assert.doesNotMatch(text, /from\s+['"]jose['"]/, file)
    }
  })
})

describe('pkcs8Bytes', () => {
  test('a PEM private half and a base64 one give the same bytes', () => {
    const der = toBase64(Uint8Array.from([1, 2, 3, 4, 5, 250]))
    const pem = `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----\n`
    assert.deepEqual(pkcs8Bytes(pem), pkcs8Bytes(der))
  })
})
