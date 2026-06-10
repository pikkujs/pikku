import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '@pikku/core/internal'
import { httpRouter } from '@pikku/core/internal'
import { fetch } from '@pikku/core/http'
import { LocalSecretService } from '@pikku/core/services'
import { LocalVariablesService } from '@pikku/core/services'
import { wireAuth } from './wire-auth.js'

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

function makeServices(
  secrets: Record<string, unknown> = {},
  variables: Record<string, string> = {}
) {
  const varsService = new LocalVariablesService(variables)
  const secretsService = new LocalSecretService(varsService)
  for (const [key, value] of Object.entries(secrets)) {
    secretsService.setSecret(key, value)
  }
  return { secretsService, varsService }
}

function setupPikkuState(
  secretsService: LocalSecretService,
  varsService: LocalVariablesService
) {
  pikkuState(null, 'package', 'singletonServices', {
    logger: mockLogger,
    secrets: secretsService,
    variables: varsService,
  } as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)
}

describe('wireAuth integration — providers endpoint', () => {
  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
  })

  afterEach(() => {
    resetPikkuState()
    httpRouter.reset()
  })

  test('GET /auth/providers returns github and google when both are configured', async () => {
    const { secretsService, varsService } = makeServices({
      AUTH_SECRET: 'test-secret-at-least-32-chars-long-ok',
      GITHUB_OAUTH: {
        clientId: 'github-test-id',
        clientSecret: 'github-test-secret',
      },
      GOOGLE_OAUTH: {
        clientId: 'google-test-id',
        clientSecret: 'google-test-secret',
      },
    })

    setupPikkuState(secretsService, varsService)
    wireAuth({ providers: ['github', 'google'] })
    httpRouter.initialize()

    const response = await fetch(new Request('http://localhost/auth/providers'))
    assert.equal(response.status, 200)

    const body = (await response.json()) as Record<string, unknown>
    assert.ok(
      body['github'],
      'github provider must be present in /auth/providers response'
    )
    assert.ok(
      body['google'],
      'google provider must be present in /auth/providers response'
    )
  })

  test('GET /auth/providers with only github configured returns only github', async () => {
    const { secretsService, varsService } = makeServices({
      AUTH_SECRET: 'test-secret-at-least-32-chars-long-ok',
      GITHUB_OAUTH: {
        clientId: 'github-test-id',
        clientSecret: 'github-test-secret',
      },
    })

    setupPikkuState(secretsService, varsService)
    wireAuth({ providers: ['github', 'google'] })
    httpRouter.initialize()

    const response = await fetch(new Request('http://localhost/auth/providers'))
    assert.equal(response.status, 200)

    const body = (await response.json()) as Record<string, unknown>
    assert.ok(body['github'], 'github must be present')
    assert.equal(
      body['google'],
      undefined,
      'google must be absent when its secret is missing'
    )
  })

  test('GET /auth/providers for auth0 calls services.variables.get(AUTH0_ISSUER)', async () => {
    const variableGetCalls: string[] = []

    const { secretsService } = makeServices({
      AUTH_SECRET: 'test-secret-at-least-32-chars-long-ok',
      AUTH0_OAUTH: {
        clientId: 'auth0-test-id',
        clientSecret: 'auth0-test-secret',
      },
    })

    const spyVars = new LocalVariablesService({
      AUTH0_ISSUER: 'https://test.auth0.com',
    })
    const originalGet = spyVars.get.bind(spyVars)
    spyVars.get = (name: string) => {
      variableGetCalls.push(name)
      return originalGet(name)
    }

    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
      secrets: secretsService,
      variables: spyVars,
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)

    wireAuth({ providers: ['auth0'] })
    httpRouter.initialize()

    await fetch(new Request('http://localhost/auth/providers'))

    assert.ok(
      variableGetCalls.includes('AUTH0_ISSUER'),
      `services.variables.get must be called with 'AUTH0_ISSUER'. Called with: [${variableGetCalls.join(', ')}]`
    )
  })

  test('GET /auth/providers for auth0 returns an OIDC provider entry when issuer variable is set', async () => {
    const { secretsService, varsService } = makeServices(
      {
        AUTH_SECRET: 'test-secret-at-least-32-chars-long-ok',
        AUTH0_OAUTH: {
          clientId: 'auth0-test-id',
          clientSecret: 'auth0-test-secret',
        },
      },
      { AUTH0_ISSUER: 'https://test-tenant.auth0.com' }
    )

    setupPikkuState(secretsService, varsService)
    wireAuth({ providers: ['auth0'] })
    httpRouter.initialize()

    const response = await fetch(new Request('http://localhost/auth/providers'))
    assert.equal(response.status, 200)

    const body = (await response.json()) as Record<
      string,
      { id: string; type: string; signinUrl: string }
    >
    assert.ok(
      body['auth0'],
      'auth0 must be present in /auth/providers response'
    )
    assert.equal(body['auth0'].type, 'oidc', 'auth0 provider type must be oidc')
    assert.ok(body['auth0'].signinUrl, 'auth0 must have a signinUrl')
  })
})
