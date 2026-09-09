import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeAuthGen } from './serialize-auth-gen.js'
import type { AuthDefinition } from '@pikku/inspector'

const AUTH_FILE = '/project/.pikku/auth.gen.ts'
const SOURCE_FILE = '/project/src/auth.ts'
const leaf = (name: string) => `./${name}/index.js`

const def = (overrides: Partial<AuthDefinition> = {}): AuthDefinition => ({
  exportName: 'auth',
  sourceFile: SOURCE_FILE,
  basePath: '/api/auth',
  hasCredentials: false,
  services: { optimized: true, services: ['kysely', 'secrets'] },
  ...overrides,
})

const gen = (providers: string[], d: AuthDefinition = def()) =>
  serializeAuthGen(d, providers, AUTH_FILE, leaf, {})
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
    // Each name comes from the leaf it belongs to, resolved relative to the
    // scaffold location (not the `#pikku` subpath) so it works when the
    // scaffold dir is outside the package's imports map.
    assert.match(
      output,
      /import { pikkuSessionlessFunc } from '\.\/function\/index\.js'/
    )
    assert.match(output, /import { wireHTTPRoutes } from '\.\/http\/index\.js'/)
    assert.match(
      output,
      /import { createAuthHandler, betterAuthSession } from '@pikku\/better-auth'/
    )
  })

  test('session middleware is global, not HTTP-only, so MCP calls get a session', () => {
    // These two resolve a session from whatever request the call arrived on.
    // Registered with addHTTPMiddleware they ran for HTTP wirings alone, so an
    // MCP tool fronting a session-requiring function answered 'Authentication
    // required' no matter how the caller authenticated. Registered globally they
    // run for any wiring; the ones with no request — queue, scheduler, cli —
    // are unaffected, because every one of these middlewares opens with
    // `if (!http?.request) return`.
    const output = gen(['github'], def({ cookieCache: true })).middleware
    assert.ok(output, 'stateless auth should emit a middleware file')
    assert.match(output!, /addGlobalMiddleware\(\[/)
    assert.doesNotMatch(output!, /addHTTPMiddleware/)
    assert.match(
      output!,
      /import { addGlobalMiddleware } from '@pikku\/core\/middleware'/
    )
  })

  test('secrets file imports zod and defineSecret', () => {
    const output = genSecrets(['github'])
    assert.match(output, /import { defineSecret } from '@pikku\/core\/secret'/)
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
    assert.match(output, /betterAuthSession\(\{ priority: 'lowest' \}\)/)
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

  test('generates defineSecret for provider credentials', () => {
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
    assert.match(
      output,
      /addGlobalMiddleware\(\[\s*betterAuthSession\(\{ priority: 'lowest' \}\),\s*\]\)/
    )
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
    assert.doesNotMatch(wiring, /defineSecret/)
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

  test('does not emit defineVariable for standard oauth providers', () => {
    assert.doesNotMatch(genSecrets(['github']), /defineVariable\({/)
  })

  test('emits defineVariable for microsoft tenantId', () => {
    assert.match(genSecrets(['microsoft']), /variableId: 'MICROSOFT_TENANT_ID'/)
  })

  test('emits defineVariable for cognito domain', () => {
    assert.match(genSecrets(['cognito']), /variableId: 'COGNITO_DOMAIN'/)
  })

  test('defineVariable schema is a named const reference, not inline (PKU111)', () => {
    const out = genSecrets(['cognito'])
    // A named schema const must be exported and referenced by the defineVariable.
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
        /addGlobalMiddleware\(\[\s*betterAuthSession\(\{ priority: 'lowest' \}\),\s*\]\)/
      )
    })

    test('with cookieCache the wiring file drops the session middleware', () => {
      const out = gen(['github'], statelessDef)
      assert.doesNotMatch(out.wiring, /addGlobalMiddleware/)
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
        /addGlobalMiddleware\(\[\s*betterAuthStatelessSession\(\{ priority: 'lowest' \}\),\s*\]\)/
      )
      // Critically: it must NOT pull the full better-auth server in.
      assert.doesNotMatch(mw, /import '\.\.\/src\/auth\.js'/)
      assert.doesNotMatch(mw, /createAuthHandler/)
    })
  })

  describe('console bearer token (scaffold.console enabled)', () => {
    const statelessDef = def({ cookieCache: true })
    const genConsole = (d: AuthDefinition = def()) =>
      serializeAuthGen(d, ['github'], AUTH_FILE, leaf, {}, true)

    // The token rides in whichever file carries the session registration. That
    // is safe only because the session registration is now always emitted: it
    // used to be skipped when the app supplied its own session middleware, and
    // the token vanished with it, 403ing every console:* RPC.
    test('rides alongside the session registration on both paths', () => {
      const stateless = genConsole(statelessDef).middleware!
      const stateful = genConsole().wiring
      for (const file of [stateless, stateful]) {
        assert.match(file, /authBearer \} from '@pikku\/core\/middleware'/)
        assert.match(
          file,
          /addGlobalMiddleware\(\[[\s\S]*?authBearer\(\{[\s\S]*?secretId: 'PIKKU_CONSOLE_TOKEN'[\s\S]*?\}\),\s*\]\)/
        )
        assert.doesNotMatch(file, /process\.env/)
      }
      assert.match(stateless, /betterAuthStatelessSession/)
      assert.match(stateful, /betterAuthSession/)
    })

    // `wireAddon({ name: 'console', ..., scopes: ['pikku:console'] })` gates
    // every console:* RPC under the `pikku` root, and the console also calls
    // the `admin:*` RPCs @pikku/addon-admin ships. The two grants are
    // independent — `pikku:console` authorizes the console RPCs, the matching
    // `admin:*` scope authorizes each admin one — so a token session holding
    // neither authenticates but authorizes nothing, which reads as a broken
    // console rather than a missing grant.
    test('the token session holds the scope roots the console addon gates on', () => {
      for (const emitted of [
        genConsole(statelessDef).middleware!,
        genConsole().wiring,
      ]) {
        assert.match(emitted, /userId: 'pikku-console-token'/)
        assert.match(emitted, /scopes: \['admin', 'pikku'\]/)
      }
    })

    test('without scaffold.console no authBearer is emitted', () => {
      assert.doesNotMatch(gen(['github']).wiring, /authBearer/)
      assert.doesNotMatch(
        gen(['github'], statelessDef).middleware ?? '',
        /authBearer/
      )
    })
  })

  // pikkujs/pikku#754: two session middlewares used to be reconciled by having
  // the CLI detect the app's own registration and generate nothing — a silent
  // drop that also took the console token with it. `lowest` orders the
  // generated one after the app's `medium` default, so the app resolves the
  // session first and the generated one short-circuits.
  describe('generated session middleware is deprioritised, never skipped', () => {
    test('both paths register at lowest priority', () => {
      assert.match(gen(['github']).wiring, /priority: 'lowest'/)
      assert.match(
        gen(['github'], def({ cookieCache: true })).middleware!,
        /priority: 'lowest'/
      )
    })
  })
})
