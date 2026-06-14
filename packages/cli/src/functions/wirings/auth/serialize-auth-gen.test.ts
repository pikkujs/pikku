import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeAuthGen } from './serialize-auth-gen.js'
import type { AuthDefinition } from '@pikku/inspector'

const AUTH_FILE = '/project/.pikku/auth.gen.ts'
const SOURCE_FILE = '/project/src/auth.ts'

const def = (overrides: Partial<AuthDefinition> = {}): AuthDefinition => ({
  exportName: 'auth',
  sourceFile: SOURCE_FILE,
  basePath: '/auth',
  services: { optimized: true, services: ['kysely', 'secrets', 'variables'] },
  ...overrides,
})

const gen = (providers: string[], d: AuthDefinition = def()) =>
  serializeAuthGen(d, providers, AUTH_FILE, {})
const genWiring = (providers: string[], d: AuthDefinition = def()) =>
  gen(providers, d).wiring
const genSecrets = (providers: string[], d: AuthDefinition = def()) =>
  gen(providers, d).secrets

describe('serializeAuthGen', () => {
  test('throws for unknown providers', () => {
    assert.throws(
      () => gen(['nonexistent-provider']),
      /defineAuth: unknown providers: nonexistent-provider/
    )
  })

  test('wiring file imports the framework modules it uses', () => {
    const output = genWiring(['github'])
    assert.match(output, /import { pikkuSessionlessFunc } from '#pikku'/)
    assert.match(
      output,
      /import { wireHTTPRoutes, addHTTPMiddleware } from '@pikku\/core\/http'/
    )
    assert.match(
      output,
      /import { createAuthHandler, authJsSession } from '@pikku\/auth-js'/
    )
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
    assert.match(output, /createAuthHandler\(myAuth\.configFactory\)/)
  })

  test('generates Zod schema for github provider in the secrets file', () => {
    const output = genSecrets(['github'])
    assert.match(output, /const GithubOAuthSchema = z\.object\({/)
    assert.match(output, /clientId:/)
    assert.match(output, /clientSecret:/)
  })

  test('generates wireSecret for AUTH_SECRET', () => {
    const output = genSecrets(['github'])
    assert.match(output, /wireSecret\({/)
    assert.match(output, /secretId: 'AUTH_SECRET'/)
    assert.match(output, /displayName: 'Auth Secret'/)
  })

  test('generates wireSecret for provider credentials', () => {
    assert.match(genSecrets(['github']), /secretId: 'GITHUB_OAUTH'/)
  })

  test('generates one shared exported handler as an inspectable arrow', () => {
    const output = genWiring(['github'])
    // The handler must be a plain arrow (not `createAuthHandler(...).func`
    // directly) so the inspector resolves a valid `func`.
    assert.match(
      output,
      /const authConfigHandler = createAuthHandler\(auth\.configFactory\)/
    )
    assert.match(output, /export const authHandler = pikkuSessionlessFunc\(\{/)
    assert.match(output, /func: \(services, data, interaction\) =>/)
    assert.match(
      output,
      /authConfigHandler\.func\(services, data, interaction\)/
    )
  })

  test('registers the Auth.js session-bridge middleware globally', () => {
    const output = genWiring([])
    assert.match(
      output,
      /addHTTPMiddleware\('\*', \[authJsSession\(\{ secretId: 'AUTH_SECRET' \}\)\]\)/
    )
  })

  test('wires every auth route to the shared handler with auth:false', () => {
    const output = genWiring(['github'])
    assert.match(output, /wireHTTPRoutes\(\{/)
    assert.match(output, /route: '\/auth\/csrf', func: authHandler, auth: false/)
    assert.match(output, /route: '\/auth\/session', func: authHandler, auth: false/)
    assert.match(
      output,
      /route: '\/auth\/callback\/:provider', func: authHandler, auth: false/
    )
    assert.match(
      output,
      /route: '\/auth\/signin\/:provider', func: authHandler, auth: false/
    )
  })

  test('applies a custom basePath to every route', () => {
    const output = genWiring(['github'], def({ basePath: '/api/auth' }))
    assert.match(output, /route: '\/api\/auth\/csrf'/)
    assert.match(output, /route: '\/api\/auth\/session'/)
  })

  test('works with credentials-only auth (no providers)', () => {
    const { wiring, secrets } = gen([])
    assert.match(wiring, /export const authHandler = pikkuSessionlessFunc/)
    assert.match(wiring, /route: '\/auth\/csrf', func: authHandler/)
    assert.match(secrets, /secretId: 'AUTH_SECRET'/)
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
    // The wiring file must not declare schemas or it co-locates schemas with
    // wireHTTPRoutes, which the CLI rejects.
    assert.doesNotMatch(wiring, /z\.object/)
    assert.doesNotMatch(wiring, /z\.string/)
    assert.doesNotMatch(wiring, /wireSecret/)
  })

  test('keeps wireHTTPRoutes out of the secrets file (PKU490)', () => {
    const { secrets } = gen(['github'])
    assert.doesNotMatch(secrets, /wireHTTPRoutes/)
    assert.doesNotMatch(secrets, /addHTTPMiddleware/)
  })

  test('generates hyphenated provider names correctly (microsoft-entra-id)', () => {
    const output = genSecrets(['microsoft-entra-id'])
    assert.match(output, /MicrosoftEntraIdOAuthSchema/)
    assert.match(output, /microsoftEntraIdOAuth/)
  })

  test('does not emit wireVariable for standard oauth providers', () => {
    assert.doesNotMatch(genSecrets(['github']), /wireVariable\({/)
  })

  test('emits wireVariable for auth0 issuer', () => {
    const output = genSecrets(['auth0'])
    assert.match(output, /wireVariable\({/)
    assert.match(output, /variableId: 'AUTH0_ISSUER'/)
    assert.match(output, /description: 'Auth0 tenant URL/)
  })

  test('emits wireVariable for okta issuer', () => {
    assert.match(genSecrets(['okta']), /variableId: 'OKTA_ISSUER'/)
  })

  test('emits wireVariable for microsoft-entra-id tenantId', () => {
    assert.match(
      genSecrets(['microsoft-entra-id']),
      /variableId: 'MICROSOFT_ENTRA_ID_TENANT_ID'/
    )
  })
})
