import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { verifyScopes } from './scopes.js'
import { MissingScopeError } from './errors/errors.js'
import type { CoreUserSession } from './types/core.types.js'

const session = (scopes?: string[]): CoreUserSession =>
  ({ userId: 'test-user', scopes }) as CoreUserSession

describe('verifyScopes', () => {
  test('passes on an exact match', () => {
    verifyScopes(['invoices:create'], session(['invoices:create']))
  })

  test('passes when no scopes are required', () => {
    verifyScopes([], session())
  })

  test('throws when the session holds none', () => {
    assert.throws(
      () => verifyScopes(['invoices:create'], session([])),
      MissingScopeError
    )
  })

  test('holding an unrelated scope does not grant', () => {
    assert.throws(
      () => verifyScopes(['invoices:create'], session(['billing:read'])),
      MissingScopeError
    )
  })

  describe('wildcards', () => {
    test('admin:* satisfies a descendant', () => {
      verifyScopes(['admin:invoices:create'], session(['admin:*']))
    })

    test('admin:* satisfies an intermediate descendant', () => {
      verifyScopes(['admin:invoices'], session(['admin:*']))
    })

    test('admin:* satisfies the parent itself', () => {
      verifyScopes(['admin'], session(['admin:*']))
    })

    test('a bare * satisfies anything', () => {
      verifyScopes(['admin:invoices:create'], session(['*']))
    })

    test('a deep wildcard satisfies its own descendants', () => {
      verifyScopes(['admin:invoices:create'], session(['admin:invoices:*']))
    })

    test('does not leak across siblings', () => {
      assert.throws(
        () => verifyScopes(['billing:read'], session(['admin:*'])),
        MissingScopeError
      )
    })

    test('a required wildcard is not satisfied by one narrow grant', () => {
      assert.throws(
        () => verifyScopes(['admin:*'], session(['admin:invoices:create'])),
        MissingScopeError
      )
    })

    test('a required wildcard is satisfied by a broader grant', () => {
      verifyScopes(['admin:*'], session(['*']))
    })
  })

  describe('AND semantics', () => {
    test('passes only when every required scope is held', () => {
      verifyScopes(
        ['invoices:read', 'invoices:write'],
        session(['invoices:read', 'invoices:write'])
      )
    })

    test('throws when only one of two is held', () => {
      assert.throws(
        () =>
          verifyScopes(
            ['invoices:read', 'invoices:write'],
            session(['invoices:read'])
          ),
        MissingScopeError
      )
    })

    test('one wildcard can satisfy several requirements', () => {
      verifyScopes(['admin:read', 'admin:write'], session(['admin:*']))
    })
  })

  describe('fails closed', () => {
    test('throws when the session has no scopes field', () => {
      assert.throws(
        () => verifyScopes(['invoices:create'], session(undefined)),
        MissingScopeError
      )
    })

    test('throws when there is no session at all', () => {
      assert.throws(
        () => verifyScopes(['invoices:create'], undefined),
        MissingScopeError
      )
    })

    test('a narrower grant does not satisfy a broader requirement', () => {
      assert.throws(
        () => verifyScopes(['admin'], session(['admin:invoices'])),
        MissingScopeError
      )
    })
  })

  describe('a parent grant coexists with a child grant', () => {
    test('the parent still grants when a child is also held', () => {
      verifyScopes(
        ['admin:invoices'],
        session(['admin:invoices', 'admin:invoices:create'])
      )
    })

    test('the child still grants when a parent is also held', () => {
      verifyScopes(
        ['admin:invoices:create'],
        session(['admin:invoices', 'admin:invoices:create'])
      )
    })
  })

  test('names the missing scope', () => {
    assert.throws(
      () => verifyScopes(['a:b', 'c:d'], session(['a:b'])),
      (err: MissingScopeError) => {
        assert.equal(err.payload.scope, 'c:d')
        assert.match(err.message, /c:d/)
        return true
      }
    )
  })
})
