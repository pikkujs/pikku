import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  effectivePort,
  hostMatches,
  validateHostPattern,
} from './host-match.js'

describe('hostMatches', () => {
  test('a wildcard matches a subdomain at any depth', () => {
    assert.equal(hostMatches('a.x.com', 443, '*.x.com'), true)
    assert.equal(hostMatches('b.a.x.com', 443, '*.x.com'), true)
  })

  test('a wildcard does not match the bare domain or a lookalike', () => {
    assert.equal(hostMatches('x.com', 443, '*.x.com'), false)
    assert.equal(hostMatches('ax.com', 443, '*.x.com'), false)
    assert.equal(hostMatches('a.x.com.evil', 443, '*.x.com'), false)
    assert.equal(hostMatches('evil-x.com', 443, '*.x.com'), false)
  })

  test('an exact pattern matches only that host', () => {
    assert.equal(hostMatches('api.x.com', 443, 'api.x.com'), true)
    assert.equal(hostMatches('a.api.x.com', 443, 'api.x.com'), false)
    assert.equal(hostMatches('x.com', 443, 'api.x.com'), false)
  })

  test('is case insensitive and ignores a trailing dot', () => {
    assert.equal(hostMatches('API.X.COM', 443, 'api.x.com'), true)
    assert.equal(hostMatches('a.x.com', 443, '*.X.Com'), true)
    assert.equal(hostMatches('api.x.com.', 443, 'api.x.com'), true)
  })

  test('a pattern without a port matches any port', () => {
    assert.equal(hostMatches('api.x.com', 8443, 'api.x.com'), true)
    assert.equal(hostMatches('api.x.com', undefined, 'api.x.com'), true)
  })

  test('a pattern with a port matches only that port', () => {
    assert.equal(hostMatches('api.x.com', 8443, 'api.x.com:8443'), true)
    assert.equal(hostMatches('api.x.com', '8443', 'api.x.com:8443'), true)
    assert.equal(hostMatches('api.x.com', 443, 'api.x.com:8443'), false)
    assert.equal(hostMatches('a.x.com', 8443, '*.x.com:8443'), true)
    assert.equal(hostMatches('a.x.com', 443, '*.x.com:8443'), false)
  })

  test('matches IP literals exactly, with or without brackets and port', () => {
    assert.equal(hostMatches('10.0.0.5', 80, '10.0.0.5'), true)
    assert.equal(hostMatches('10.0.0.5', 8080, '10.0.0.5:8080'), true)
    assert.equal(hostMatches('[::1]', 8080, '[::1]:8080'), true)
    assert.equal(hostMatches('[::1]', 80, '::1'), true)
    assert.equal(hostMatches('::1', 80, '[::1]'), true)
    assert.equal(hostMatches('10.0.0.6', 80, '10.0.0.5'), false)
  })

  test('a wildcard never matches an IP literal', () => {
    assert.equal(hostMatches('10.0.0.1', 443, '*.0.0.1'), false)
    assert.equal(hostMatches('1.2.3.4', 443, '*.2.3.4'), false)
  })

  test('an invalid pattern matches nothing', () => {
    assert.equal(hostMatches('example.com', 443, '*.com'), false)
    assert.equal(hostMatches('example.com', 443, '*'), false)
    assert.equal(hostMatches('example.com', 443, 'https://example.com'), false)
    assert.equal(hostMatches('example.com', 443, ''), false)
  })
})

describe('validateHostPattern', () => {
  const reasonOf = (pattern: string) => {
    const result = validateHostPattern(pattern)
    return result.valid ? undefined : result.reason
  }

  test('accepts hosts, ports, IP literals and a leading wildcard', () => {
    for (const pattern of [
      'api.example.com',
      'api.example.com:8443',
      '*.example.com',
      '*.api.example.co.uk',
      '*.example.com:443',
      'localhost',
      'localhost:3000',
      '10.0.0.5',
      '10.0.0.5:8080',
      '[::1]',
      '[::1]:8080',
      'fd00::1',
      'my_service.internal',
    ]) {
      assert.equal(reasonOf(pattern), undefined, pattern)
    }
  })

  test('refuses a wildcard over a top-level domain', () => {
    assert.match(reasonOf('*.com')!, /at least two labels/)
  })

  test('refuses a bare wildcard', () => {
    assert.match(reasonOf('*')!, /every host/)
  })

  test('refuses a wildcard anywhere but the front, or more than one', () => {
    for (const pattern of [
      'api.*.com',
      '*api.example.com',
      '*.*.example.com',
    ]) {
      assert.match(reasonOf(pattern)!, /single leading/, pattern)
    }
  })

  test('refuses a wildcard over an IP address', () => {
    assert.match(reasonOf('*.0.0.1')!, /IP address/)
    assert.match(reasonOf('*.168.0.1')!, /IP address/)
    assert.ok(reasonOf('*.[::1]'))
  })

  test('refuses empty labels', () => {
    for (const pattern of ['a..example.com', '.example.com', 'example.com.']) {
      assert.match(reasonOf(pattern)!, /empty label/, pattern)
    }
  })

  test('refuses schemes, paths, queries and credentials', () => {
    assert.match(reasonOf('https://example.com')!, /scheme/)
    for (const pattern of [
      'example.com/path',
      'example.com?q=1',
      'example.com#frag',
      'user@example.com',
    ]) {
      assert.match(reasonOf(pattern)!, /path, query or credentials/, pattern)
    }
  })

  test('refuses a port out of range or not numeric', () => {
    for (const pattern of ['example.com:0', 'example.com:65536', 'a.com:x']) {
      assert.match(reasonOf(pattern)!, /not a port/, pattern)
    }
  })

  test('refuses an empty pattern', () => {
    assert.match(reasonOf('')!, /empty/)
  })
})

describe('effectivePort', () => {
  test('uses the explicit port, or the scheme default', () => {
    assert.equal(effectivePort(new URL('https://a.com')), '443')
    assert.equal(effectivePort(new URL('http://a.com')), '80')
    assert.equal(effectivePort(new URL('https://a.com:8443')), '8443')
  })
})
