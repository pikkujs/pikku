import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeAuthGen } from './serialize-auth-gen.js'
import type { AuthDefinition } from '@pikku/inspector'

const AUTH_FILE = '/project/.pikku/auth.gen.ts'
const SOURCE_FILE = '/project/src/auth.ts'
const TYPES_FILE = '/project/.pikku/pikku-types.gen.ts'

const def = (overrides: Partial<AuthDefinition> = {}): AuthDefinition => ({
  exportName: 'auth',
  sourceFile: SOURCE_FILE,
  basePath: '/api/auth',
  hasCredentials: false,
  services: { optimized: true, services: ['kysely', 'secrets'] },
  ...overrides,
})

const gen = (providers: string[], d: AuthDefinition = def()) =>
  serializeAuthGen(d, providers, AUTH_FILE, TYPES_FILE, {})
const genWiring = (providers: string[], d: AuthDefinition = def()) =>
  gen(providers, d).wiring
const genSecrets = (providers: string[], d: AuthDefinition = def()) =>
  gen(providers, d).secrets

describe('serializeAuthGen', () => {
  test('silently ignores unknown providers (genericOAuth plugin etc.)', () => {
    // Unknown keys are skipped (not thrown) — they may come from the genericOAuth
    // plugin, whose secret the user wires manually.
    const secrets = genSecrets(['nonexistent-provider'])
    assert.doesNotMatch(secrets, /NonexistentProvider/)
  })

  test('wiring file imports the framework modules it uses', () => {
    const output = genWiring(['github'])
    // The pikku types import is resolved relative to the scaffold location (not
    // the `#pikku` subpath) so it works when the scaffold dir is outside the
    // package's imports map.
    assert.match(
      output,
      /import { pikkuSessionlessFunc, wireHTTPRoutes, addHTTPMiddleware } from '\.\/pikku-types\.gen\.js'/
    )
    assert.match(
      output,
      /import { createAuthHandler, betterAuthSession } from '@pikku\/better-auth'/
    )
  })

  test('secrets file imports zod and wireSecret', () => {
    const output = genSecrets(['github'])
    assert.match(output, /import { wireSecret } from '@pikku\/core\/secret'/)
    assert.match(output, /import { z } from 'zod'/)
  })

  test('side-effect imports the user source file so the factory registers', () => {
    const output = genWiring(['github'])
    // /project/.pikku/auth.gen.ts -> /project/src/auth.ts == ../src/auth.js
    assert.match(output, /import '\.\.\/src\/auth\.js'/)
  })

  test('resolves auth from services regardless of export name', () => {
    const output = genWiring(['github'], def({ exportName: 'myAuth' }))
    assert.match(output, /import '\.\.\/src\/auth\.js'/)
    assert.match(output, /createAuthHandler\(\)/)
    assert.match(output, /betterAuthSession\(\)/)
  })

  test('does not wire provider metadata at runtime (emitted as auth-meta.gen.json)', () => {
    const output = genWiring(['github'], def({ hasCredentials: true }))
    assert.doesNotMatch(output, /setAuthRegistry/)
    assert.doesNotMatch(output, /@pikku\/core'/)
  })

  test('always wires the better-auth signing secret', () => {
    const output = genSecrets([])
    assert.match(output, /secretId: 'BETTER_AUTH_SECRET'/)
    assert.match(output, /displayName: 'Better Auth Secret'/)
  })

  test('generates Zod schema for github provider in the secrets file', () => {
    const output = genSecrets(['github'])
    assert.match(output, /const GithubOAuthSchema = z\.object\({/)
    assert.match(output, /clientId:/)
    assert.match(output, /clientSecret:/)
  })

  test('generates wireSecret for provider credentials', () => {
    assert.match(genSecrets(['github']), /secretId: 'GITHUB_OAUTH'/)
  })

  test('generates one shared exported handler as an inspectable arrow', () => {
    const output = genWiring(['github'])
    // The handler must be a plain arrow (not `createAuthHandler(...).func`
    // directly) so the inspector resolves a valid `func`.
    assert.match(output, /const authConfigHandler = createAuthHandler\(\)/)
    assert.match(output, /export const authHandler = pikkuSessionlessFunc\(\{/)
    assert.match(
      output,
      /func: \(services: any, data: any, interaction: any\) =>/
    )
    assert.match(
      output,
      /authConfigHandler\.func\(services, data, interaction\)/
    )
  })

  test('registers the better-auth session-bridge middleware globally', () => {
    const output = genWiring([])
    assert.match(output, /addHTTPMiddleware\('\*', \[betterAuthSession\(\)\]\)/)
  })

  test('wires a catch-all route per method to the shared handler', () => {
    const output = genWiring(['github'])
    assert.match(output, /wireHTTPRoutes\(\{/)
    assert.match(
      output,
      /getAuthCatchAll: \{ method: 'get', route: '\/api\/auth\{\/\*splat\}', func: authHandler, auth: false \}/
    )
    assert.match(
      output,
      /postAuthCatchAll: \{ method: 'post', route: '\/api\/auth\{\/\*splat\}', func: authHandler, auth: false \}/
    )
  })

  test('applies a custom basePath to the catch-all route', () => {
    const output = genWiring(['github'], def({ basePath: '/auth' }))
    assert.match(output, /route: '\/auth\{\/\*splat\}'/)
  })

  test('works with credentials-only auth (no providers)', () => {
    const { wiring, secrets } = gen([], def({ hasCredentials: true }))
    assert.match(wiring, /export const authHandler = pikkuSessionlessFunc/)
    assert.match(wiring, /route: '\/api\/auth\{\/\*splat\}', func: authHandler/)
    assert.match(secrets, /secretId: 'BETTER_AUTH_SECRET'/)
    assert.doesNotMatch(secrets, /OAuthSchema/)
  })

  test('generates code for multiple providers', () => {
    const output = genSecrets(['github', 'google'])
    assert.match(output, /GithubOAuthSchema/)
    assert.match(output, /GoogleOAuthSchema/)
    assert.match(output, /secretId: 'GITHUB_OAUTH'/)
    assert.match(output, /secretId: 'GOOGLE_OAUTH'/)
  })

  test('both files start with the auto-generated comment', () => {
    const { wiring, secrets } = gen(['github'])
    assert.match(wiring, /^\/\/ AUTO-GENERATED by pikku CLI/)
    assert.match(secrets, /^\/\/ AUTO-GENERATED by pikku CLI/)
  })

  test('keeps Zod schemas out of the HTTP wiring file (PKU490)', () => {
    const { wiring } = gen(['github'])
    assert.doesNotMatch(wiring, /z\.object/)
    assert.doesNotMatch(wiring, /z\.string/)
    assert.doesNotMatch(wiring, /wireSecret/)
  })

  test('keeps wireHTTPRoutes out of the secrets file (PKU490)', () => {
    const { secrets } = gen(['github'])
    assert.doesNotMatch(secrets, /wireHTTPRoutes/)
    assert.doesNotMatch(secrets, /addHTTPMiddleware/)
  })

  test('derives schema/secret names from the provider key (microsoft)', () => {
    const output = genSecrets(['microsoft'])
    assert.match(output, /MicrosoftOAuthSchema/)
    assert.match(output, /microsoftOAuth/)
    assert.match(output, /secretId: 'MICROSOFT_OAUTH'/)
  })

  test('does not emit wireVariable for standard oauth providers', () => {
    assert.doesNotMatch(genSecrets(['github']), /wireVariable\({/)
  })

  test('emits wireVariable for microsoft tenantId', () => {
    assert.match(genSecrets(['microsoft']), /variableId: 'MICROSOFT_TENANT_ID'/)
  })

  test('emits wireVariable for cognito domain', () => {
    assert.match(genSecrets(['cognito']), /variableId: 'COGNITO_DOMAIN'/)
  })

  test('wireVariable schema is a named const reference, not inline (PKU111)', () => {
    const out = genSecrets(['cognito'])
    // A named schema const must be exported and referenced by the wireVariable.
    assert.match(out, /export const \w+VariableSchema = z\.string\(\)/)
    assert.match(out, /schema: \w+VariableSchema,/)
    // The inline form would trip PKU111 (schema must be an identifier).
    assert.doesNotMatch(out, /schema: z\.string\(\),/)
  })

  describe('cookieCache → stateless session middleware split', () => {
    const statelessDef = def({ cookieCache: true })

    test('without cookieCache the middleware stays in the wiring file (no split)', () => {
      const out = gen(['github'])
      assert.equal(out.middleware, undefined)
      assert.match(
        out.wiring,
        /addHTTPMiddleware\('\*', \[betterAuthSession\(\)\]\)/
      )
    })

    test('with cookieCache the wiring file drops the session middleware', () => {
      const out = gen(['github'], statelessDef)
      assert.doesNotMatch(out.wiring, /addHTTPMiddleware/)
      assert.doesNotMatch(out.wiring, /betterAuthSession/)
    })

    test('with cookieCache the wiring file keeps handler + routes + auth.wiring import', () => {
      const out = gen(['github'], statelessDef)
      // The full server stays here — only the auth unit bundles this file.
      assert.match(
        out.wiring,
        /import { createAuthHandler } from '@pikku\/better-auth'/
      )
      assert.match(out.wiring, /import '\.\.\/src\/auth\.js'/)
      assert.match(out.wiring, /wireHTTPRoutes\(/)
      assert.match(out.wiring, /getAuthCatchAll:/)
    })

    test('with cookieCache a separate middleware file registers the stateless verifier', () => {
      const out = gen(['github'], statelessDef)
      assert.ok(out.middleware, 'middleware file should be emitted')
      const mw = out.middleware!
      assert.match(
        mw,
        /import { betterAuthStatelessSession } from '@pikku\/better-auth'/
      )
      assert.match(
        mw,
        /addHTTPMiddleware\('\*', \[betterAuthStatelessSession\(\)\]\)/
      )
      // Critically: it must NOT pull the full better-auth server in.
      assert.doesNotMatch(mw, /import '\.\.\/src\/auth\.js'/)
      assert.doesNotMatch(mw, /createAuthHandler/)
    })
  })

  describe('user-registered global betterAuthSession → CLI steps aside', () => {
    const genSkip = (providers: string[], d: AuthDefinition = def()) =>
      serializeAuthGen(d, providers, AUTH_FILE, TYPES_FILE, {}, true)

    test('drops the generated stateful session middleware (no double-register)', () => {
      const out = genSkip(['github'])
      assert.doesNotMatch(out.wiring, /addHTTPMiddleware/)
      assert.doesNotMatch(out.wiring, /betterAuthSession/)
    })

    test('still keeps the handler, routes and createAuthHandler import', () => {
      const out = genSkip(['github'])
      assert.match(
        out.wiring,
        /import { createAuthHandler } from '@pikku\/better-auth'/
      )
      assert.match(out.wiring, /wireHTTPRoutes\(/)
      assert.match(out.wiring, /getAuthCatchAll:/)
    })

    test('by default (no user registration) the middleware is still generated', () => {
      assert.match(
        genWiring(['github']),
        /addHTTPMiddleware\('\*', \[betterAuthSession\(\)\]\)/
      )
    })
  })
})
