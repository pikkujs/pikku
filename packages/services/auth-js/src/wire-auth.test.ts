import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { wireAuth } from './wire-auth.js'
import { pikkuState, resetPikkuState } from '@pikku/core/internal'

describe('wireAuth', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('registers auth GET routes in pikku http meta', () => {
    wireAuth({ providers: [] })
    const httpMeta = pikkuState(null, 'http', 'meta')
    assert.ok(
      typeof httpMeta.get === 'object',
      'http GET meta must be an object'
    )
    const getRoutes = Object.keys(httpMeta.get)
    assert.ok(
      getRoutes.some((r) => r === '/auth/session'),
      '/auth/session GET route must be registered'
    )
    assert.ok(
      getRoutes.some((r) => r === '/auth/signin'),
      '/auth/signin GET route must be registered'
    )
  })

  test('registers auth POST routes in pikku http meta', () => {
    wireAuth({ providers: [] })
    const httpMeta = pikkuState(null, 'http', 'meta')
    assert.ok(
      typeof httpMeta.post === 'object',
      'http POST meta must be an object'
    )
    const postRoutes = Object.keys(httpMeta.post)
    assert.ok(
      postRoutes.some((r) => r === '/auth/signin'),
      '/auth/signin POST route must be registered'
    )
    assert.ok(
      postRoutes.some((r) => r === '/auth/signout'),
      '/auth/signout POST route must be registered'
    )
  })

  test('registers all 11 standard Auth.js routes', () => {
    wireAuth({ providers: [] })
    const httpMeta = pikkuState(null, 'http', 'meta')
    const allRoutes = [
      ...Object.keys(httpMeta.get ?? {}),
      ...Object.keys(httpMeta.post ?? {}),
    ].filter((r) => r.startsWith('/auth/'))
    assert.equal(allRoutes.length, 11)
  })

  test('uses custom basePath when provided', () => {
    wireAuth({ providers: [], basePath: '/api/auth' })
    const httpMeta = pikkuState(null, 'http', 'meta')
    const getRoutes = Object.keys(httpMeta.get ?? {})
    assert.ok(
      getRoutes.some((r) => r.startsWith('/api/auth/')),
      'routes should use custom basePath /api/auth/'
    )
    assert.ok(
      !getRoutes.some((r) => r.startsWith('/auth/')),
      'default /auth/ routes should not be registered when basePath is overridden'
    )
  })

  test('unknown providers are silently skipped without throwing', () => {
    assert.doesNotThrow(() => {
      wireAuth({ providers: ['nonexistent-provider-xyz'] as any })
    })
  })

  test('registers function meta entries for each auth route', () => {
    wireAuth({ providers: [] })
    const funcMeta = pikkuState(null, 'function', 'meta')
    const authFuncIds = Object.keys(funcMeta).filter((k) =>
      k.startsWith('authjs_')
    )
    assert.equal(authFuncIds.length, 11)
  })

  test('can be called with callbacks without throwing', () => {
    assert.doesNotThrow(() => {
      wireAuth({
        providers: [],
        callbacks: {
          session: async (_rpc, data) => data,
          redirect: async (_rpc, data) => data,
        },
      })
    })
  })

  test('can be called with credentials without throwing', () => {
    assert.doesNotThrow(() => {
      wireAuth({
        credentials: {
          fields: {
            username: { label: 'Username', type: 'text' },
            password: { label: 'Password', type: 'password' },
          },
          authorize: async (_rpc, creds) => {
            if (creds.username === 'admin') return { id: '1', name: 'Admin' }
            return null
          },
        },
      })
    })
  })

  test('can combine credentials with OAuth providers', () => {
    assert.doesNotThrow(() => {
      wireAuth({
        providers: ['github'],
        credentials: {
          authorize: async (_rpc, creds) => {
            if (creds.username === 'admin') return { id: '1', name: 'Admin' }
            return null
          },
        },
      })
    })
  })

  test('providers defaults to empty array when omitted', () => {
    assert.doesNotThrow(() => {
      wireAuth({ credentials: { authorize: async () => null } })
    })
    const httpMeta = pikkuState(null, 'http', 'meta')
    assert.ok(
      httpMeta.get,
      'routes should still be registered without providers'
    )
  })
})
