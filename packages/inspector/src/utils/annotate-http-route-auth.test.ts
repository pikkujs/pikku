import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { annotateHttpRouteAuth } from './annotate-http-route-auth.js'

const ADDON_PACKAGE = '@addon/console'

/**
 * A single GET route plus the function it points at, with the four inputs the
 * resolution reads spread across both.
 */
const resolve = (
  route: Record<string, unknown>,
  meta: Record<string, unknown> = {},
  addons: Record<string, unknown> = {}
): boolean | undefined => {
  const state = {
    functions: { meta: { handler: { pikkuFuncId: 'handler', ...meta } } },
    http: {
      meta: {
        get: {
          '/thing': {
            pikkuFuncId: 'handler',
            route: '/thing',
            method: 'get',
            ...route,
          },
        },
      },
    },
    rpc: { wireAddonDeclarations: new Map(Object.entries(addons)) },
  } as any

  annotateHttpRouteAuth(state)
  return state.http.meta.get['/thing'].requiresSession
}

describe('annotateHttpRouteAuth', () => {
  test('a pikkuFunc always requires a session', () => {
    assert.equal(resolve({}, { sessionless: false }), true)
  })

  test('a sessionless function on a plain route does not', () => {
    assert.equal(resolve({}, { sessionless: true }), false)
  })

  test("the function's own auth requires one", () => {
    assert.equal(resolve({}, { sessionless: true, auth: true }), true)
  })

  test("the route's auth requires one, even of a sessionless function", () => {
    assert.equal(resolve({ auth: true }, { sessionless: true }), true)
  })

  test('an explicit auth: false on the route does not undo the function', () => {
    // Layers only ever tighten. A route cannot open a pikkuFunc back up.
    assert.equal(resolve({ auth: false }, { sessionless: false }), true)
  })

  test('function scopes require one', () => {
    // Scopes are matched against the session's and fail closed, so an
    // anonymous caller is rejected — reporting the route as open would be a lie.
    assert.equal(resolve({}, { sessionless: true, scopes: ['admin'] }), true)
  })

  test("the addon's auth requires one", () => {
    assert.equal(
      resolve(
        { packageName: ADDON_PACKAGE },
        { sessionless: true },
        { console: { package: ADDON_PACKAGE, auth: true } }
      ),
      true
    )
  })

  test("the addon's scopes require one", () => {
    assert.equal(
      resolve(
        { packageName: ADDON_PACKAGE },
        { sessionless: true },
        { console: { package: ADDON_PACKAGE, scopes: ['admin'] } }
      ),
      true
    )
  })

  test("another package's addon gate does not reach this route", () => {
    assert.equal(
      resolve(
        { packageName: '@app/api' },
        { sessionless: true },
        { console: { package: ADDON_PACKAGE, auth: true } }
      ),
      false
    )
  })

  test('an ungated addon leaves the route as its function found it', () => {
    assert.equal(
      resolve(
        { packageName: ADDON_PACKAGE },
        { sessionless: true },
        { console: { package: ADDON_PACKAGE } }
      ),
      false
    )
  })

  test('a ref route resolves against its target', () => {
    const state = {
      functions: {
        meta: {
          inline: { pikkuFuncId: 'inline', sessionless: true },
          target: { pikkuFuncId: 'target', sessionless: false },
        },
      },
      http: {
        meta: {
          get: {
            '/thing': {
              pikkuFuncId: 'inline',
              refTarget: 'target',
              route: '/thing',
              method: 'get',
            },
          },
        },
      },
      rpc: { wireAddonDeclarations: new Map() },
    } as any

    annotateHttpRouteAuth(state)
    assert.equal(state.http.meta.get['/thing'].requiresSession, true)
  })

  test('a route whose function meta is missing is not reported as open', () => {
    const state = {
      functions: { meta: {} },
      http: {
        meta: {
          get: {
            '/thing': {
              pikkuFuncId: 'gone',
              route: '/thing',
              method: 'get',
              auth: true,
            },
          },
        },
      },
      rpc: { wireAddonDeclarations: new Map() },
    } as any

    annotateHttpRouteAuth(state)
    assert.equal(state.http.meta.get['/thing'].requiresSession, true)
  })

  test('tolerates http state being absent', () => {
    assert.doesNotThrow(() =>
      annotateHttpRouteAuth({ functions: { meta: {} } } as any)
    )
  })
})
