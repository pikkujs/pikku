import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeAuthGen } from './serialize-auth-gen.js'
import type { AuthDefinition } from '@pikku/inspector'

const AUTH_FILE = '/project/.pikku/auth.gen.ts'
const SOURCE_FILE = '/project/src/auth.ts'

const def = (overrides: Partial<AuthDefinition> = {}): AuthDefinition => ({
  exportName: 'auth',
  sourceFile: SOURCE_FILE,
  basePath: '/api/auth',
  hasCredentials: false,
  services: { optimized: true, services: ['kysely', 'secrets'] },
  ...overrides,
})

const gen = (providers: string[], d: AuthDefinition = def()) =>
  serializeAuthGen(d, providers, AUTH_FILE, {})
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
    assert.match(
      output,
      /import { pikkuSessionlessFunc, wireHTTPRoutes, addHTTPMiddleware } from '#pikku'/
    )
    assert.match(
      output,
      /import { createAuthHandler, betterAuthSession } from '@pikku\/better-auth'/
    )
    assert.match(output, /import { setAuthRegistry } from '@pikku\/core'/)
  })

  test('secrets file imports zod and wireSecret', () => {
    const output = genSecrets(['github'])
    assert.match(output, /import { wireSecret } from '@pikku\/core\/secret'/)
    assert.match(output, /import { z } from 'zod'/)
  })

  test('imports the exported config from the user source file', () => {
    const output = genWiring(['github'])
    // /project/.pikku/auth.gen.ts -> /project/src/auth.ts == ../src/auth.js
    assert.match(output, /import { auth } from '\.\.\/src\/auth\.js'/)
  })

  test('honours a custom export name', () => {
    const output = genWiring(['github'], def({ exportName: 'myAuth' }))
    assert.match(output, /import { myAuth } from /)
    assert.match(output, /createAuthHandler\(myAuth\)/)
    assert.match(output, /betterAuthSession\(\{ auth: myAuth \}\)/)
  })

  test('records provider metadata via setAuthRegistry', () => {
    const output = genWiring(['github'], def({ hasCredentials: true }))
    assert.match(output, /setAuthRegistry\(\{/)
    assert.match(
      output,
      /\{ id: 'github', displayName: 'GitHub OAuth', secretId: 'GITHUB_OAUTH' \}/
    )
    assert.match(output, /hasCredentials: true/)
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
    assert.match(output, /const authConfigHandler = createAuthHandler\(auth\)/)
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
      /addHTTPMiddleware\('\*', \[betterAuthSession\(\{ auth: auth \}\)\]\)/
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
})
