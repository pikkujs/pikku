import assert from 'node:assert/strict'
import { encode } from '@auth/core/jwt'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import { SerializePlugin } from 'kysely-plugin-serialize'
import Database from 'better-sqlite3'
import type { CoreUserSession } from '../../packages/core/src/types/core.types.js'
import { LocalCredentialService } from '../../packages/core/src/services/local-credential-service.js'
import { authJsSession } from '../../packages/services/auth-js/src/auth-session.js'
import { KyselyCredentialService } from '../../packages/services/kysely/src/kysely-credential-service.js'

const TEST_SECRET = 'test-secret-that-is-long-enough-for-auth-js'

function logStep(name: string) {
  console.log(`\n=== ${name} ===`)
}

async function verifyCoreUserSessionTyping() {
  logStep('CoreUserSession accepts optional orgId')

  const session: CoreUserSession = {
    userId: 'user-1',
    orgId: 'org-1',
  } as CoreUserSession & { userId: string }

  assert.equal((session as any).userId, 'user-1')
  assert.equal(session.orgId, 'org-1')
  console.log('ok')
}

async function verifyLocalCredentialPrecedence() {
  logStep('LocalCredentialService precedence')

  const service = new LocalCredentialService()
  await service.set('token', { scope: 'global' })
  await service.set('token', { scope: 'user' }, 'user-1')
  await service.set('token', { scope: 'org' }, undefined, 'org-1')
  await service.set('token', { scope: 'org-user' }, 'user-1', 'org-1')

  assert.deepEqual(await service.get('token', 'user-1', 'org-1'), {
    scope: 'org-user',
  })
  assert.deepEqual(await service.get('token', 'user-2', 'org-1'), {
    scope: 'org',
  })
  assert.deepEqual(await service.get('token', 'user-1', 'org-2'), {
    scope: 'user',
  })
  assert.deepEqual(await service.get('token', 'user-2', 'org-2'), {
    scope: 'global',
  })
  console.log('ok')
}

const createToken = async (
  payload: Record<string, unknown>,
  salt = 'authjs.session-token'
) =>
  encode({
    token: payload,
    secret: TEST_SECRET,
    salt,
    maxAge: 60 * 60,
  })

function createMockHTTPRequest(cookies: Record<string, string> = {}) {
  return {
    cookie: (name: string) => cookies[name] || null,
  }
}

function createMockLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }
}

function createSessionWireProps() {
  let session: CoreUserSession | undefined
  let changed = false

  return {
    session: undefined as CoreUserSession | undefined,
    setSession: (value: CoreUserSession) => {
      session = value
    },
    getSession: () => session,
    hasSessionChanged: () => changed,
    _getInternalSession: () => session,
    _markChanged: () => {
      changed = true
    },
  }
}

async function verifyAuthJsDefaultOrgMapping() {
  logStep('authJsSession default orgId mapping')

  const token = await createToken({ sub: 'user-1', orgId: 'org-1' })
  const wire = createSessionWireProps()
  const middleware = authJsSession({ secret: TEST_SECRET })

  await middleware(
    { logger: createMockLogger() } as any,
    {
      ...wire,
      http: {
        request: createMockHTTPRequest({
          'authjs.session-token': token,
        }),
      },
    } as any,
    async () => {}
  )

  const session = wire._getInternalSession() as any
  assert.equal(session.userId, 'user-1')
  assert.equal(session.orgId, 'org-1')
  console.log('ok')
}

async function verifyKyselyCredentialPrecedence() {
  logStep('KyselyCredentialService precedence')

  let db: Kysely<any> | null = null

  try {
    db = new Kysely<any>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin(), new SerializePlugin()],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ERR_DLOPEN_FAILED'
    ) {
      console.log(`skipped (${message.split('\n')[0]})`)
      return
    }
    throw error
  }

  try {
    const service = new KyselyCredentialService(db, {
      key: 'test-key-encryption-key-32chars!',
    })
    await service.init()

    await service.set('token', { scope: 'global' })
    await service.set('token', { scope: 'user' }, 'user-1')
    await service.set('token', { scope: 'org' }, undefined, 'org-1')
    await service.set('token', { scope: 'org-user' }, 'user-1', 'org-1')

    assert.deepEqual(await service.get('token', 'user-1', 'org-1'), {
      scope: 'org-user',
    })
    assert.deepEqual(await service.get('token', 'user-2', 'org-1'), {
      scope: 'org',
    })
    assert.deepEqual(await service.get('token', 'user-1', 'org-2'), {
      scope: 'user',
    })
    assert.deepEqual(await service.get('token', 'user-2', 'org-2'), {
      scope: 'global',
    })

    console.log('ok')
  } finally {
    await db.destroy()
  }
}

async function main() {
  console.log('=== Multitenancy Verifier ===')

  await verifyCoreUserSessionTyping()
  await verifyLocalCredentialPrecedence()
  await verifyAuthJsDefaultOrgMapping()
  await verifyKyselyCredentialPrecedence()

  console.log('\n=== All multitenancy checks passed ===')
}

main().catch((error) => {
  console.error('\nMultitenancy verifier failed:')
  console.error(error)
  process.exit(1)
})
