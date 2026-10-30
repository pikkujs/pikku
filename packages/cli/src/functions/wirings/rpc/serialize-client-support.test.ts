import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeAuthClient,
  serializeEnv,
  serializeRpc,
  serializeTypes,
} from './serialize-client-support.js'

describe('serializeTypes', () => {
  test('imports the RPC map from the given path and derives input and output', () => {
    const out = serializeTypes('./rpc-map.gen.d.js')
    assert.match(out, /from '\.\/rpc-map\.gen\.d\.js'/)
    assert.match(out, /type RPCInput<Name extends keyof FlattenedRPCMap>/)
    assert.match(out, /FlattenedRPCMap\[Name\]\['output'\]/)
    assert.doesNotMatch(out, /AnalyticsEvent/)
  })
  test('re-exports AnalyticsEvent only when an analytics path is given', () => {
    const out = serializeTypes('./m.js', '../analytics.gen.js')
    assert.match(
      out,
      /export type \{ AnalyticsEvent \} from '\.\.\/analytics\.gen\.js'/
    )
  })
})

describe('serializeEnv', () => {
  const out = serializeEnv()
  test('exports apiUrl, basePath and appHref', () => {
    assert.match(out, /export function apiUrl\(\)/)
    assert.match(out, /export function basePath\(\)/)
    assert.match(out, /export function appHref\(path: string\)/)
  })
  test('uses the SSR placeholder and the origin fallback', () => {
    assert.match(out, /'\/__api'/)
    assert.match(out, /window\.location\.origin \+ '\/api'/)
  })
  test('keeps the localhost leak guard', () => {
    assert.match(out, /localhost\|127/)
  })
  test('emits a real template literal for appHref', () => {
    assert.match(out, /return `\$\{basePath\(\)\}\$\{path\}`/)
  })
})

describe('serializeRpc', () => {
  const out = serializeRpc('./pikku-rpc.gen.js', './env.gen.js')
  test('imports the client class and apiUrl from computed paths', () => {
    assert.match(out, /import \{ PikkuRPC \} from '\.\/pikku-rpc\.gen\.js'/)
    assert.match(out, /import \{ apiUrl \} from '\.\/env\.gen\.js'/)
  })
  test('forwards the request cookie on the server and has no cloud hook', () => {
    assert.match(out, /getRequestHeader\('cookie'\)/)
    assert.match(out, /createIsomorphicFn/)
    assert.doesNotMatch(out, /cloud/i)
  })
})

describe('serializeAuthClient', () => {
  test('wires the session RPC and leaves default paths to the library', () => {
    const out = serializeAuthClient(
      './rpc.gen.js',
      './env.gen.js',
      'getSession'
    )
    assert.match(out, /rpc\(\)\.invoke\("getSession", \{\}\)/)
    assert.match(
      out,
      /createBetterAuthApp\(\{\n  apiUrl,\n  fetchSession,\n  redirect: gateRedirect,\n\}\)/
    )
  })
  test('passes configured paths through', () => {
    const out = serializeAuthClient('./r.js', './e.js', 'getSession', {
      loginPath: '/app/auth/login',
      homePath: '/app',
    })
    assert.match(out, /loginPath: "\/app\/auth\/login",/)
    assert.match(out, /homePath: "\/app",/)
    assert.doesNotMatch(out, /resetPasswordPath/)
  })
})
