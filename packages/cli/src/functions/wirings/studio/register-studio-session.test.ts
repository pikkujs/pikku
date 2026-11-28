import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { wireAddon, wireRemoteAddon } from '@pikku/core/addon'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import {
  registerStudioSession,
  studioSession,
  STUDIO_HEADER,
} from './register-studio-session.js'

const TOKEN = 'a'.repeat(40)

const run = async (headers: Record<string, string>, session?: object) => {
  let set: unknown
  const wire = {
    http: { request: { header: (name: string) => headers[name] ?? null } },
    session,
    setInitialSession: (s: unknown) => {
      set = s
    },
  }
  let called = false
  await (studioSession(TOKEN) as any)({}, wire, async () => {
    called = true
  })
  assert.ok(called)
  return set
}

describe('studio session', () => {
  test('the matching token becomes the studio admin', async () => {
    assert.deepEqual(await run({ [STUDIO_HEADER]: TOKEN }), {
      userId: 'studio',
      scopes: ['admin', 'pikku:otlp:runs'],
    })
  })

  test('a wrong or missing token sets nothing', async () => {
    assert.equal(await run({ [STUDIO_HEADER]: 'b'.repeat(40) }), undefined)
    assert.equal(await run({ [STUDIO_HEADER]: 'short' }), undefined)
    assert.equal(await run({}), undefined)
  })

  test('an existing session is left alone', async () => {
    assert.equal(
      await run({ [STUDIO_HEADER]: TOKEN }, { userId: 'real' }),
      undefined
    )
  })

  test('is only registered with a long enough token', () => {
    assert.equal(registerStudioSession(undefined), false)
    assert.equal(registerStudioSession('short'), false)
  })
})

const declareScopes = (packageName: string | null, ...scopes: string[][]) => {
  scopes.forEach((required, index) => {
    pikkuState(packageName, 'function', 'meta')[`fn${index}`] = {
      scopes: required,
    } as never
  })
}

describe('studio session with wired addons', () => {
  beforeEach(() => resetPikkuState())
  afterEach(() => resetPikkuState())

  const scopes = async () =>
    ((await run({ [STUDIO_HEADER]: TOKEN })) as { scopes: string[] }).scopes

  test('holds the root of every scope a wired addon function requires', async () => {
    wireAddon({ name: 'blog', package: '@acme/addon-blog' })
    wireAddon({ name: 'shop', package: '@acme/addon-shop' })
    declareScopes('@acme/addon-blog', ['blog:manage'], ['blog:read'])
    declareScopes('@acme/addon-shop', ['shop:orders:refund', 'admin:users'])

    assert.deepEqual(await scopes(), [
      'admin',
      'pikku:otlp:runs',
      'blog',
      'shop',
    ])
  })

  test('never holds the wildcard', async () => {
    wireAddon({ name: 'blog', package: '@acme/addon-blog' })
    declareScopes('@acme/addon-blog', ['*'], ['*:manage'])

    assert.deepEqual(await scopes(), ['admin', 'pikku:otlp:runs'])
  })

  test("takes nothing from the app's own functions, a package that is not wired, or a remote addon", async () => {
    wireRemoteAddon({
      name: 'cloud',
      package: '@acme/addon-cloud',
      serverUrl: 'https://cloud.example.com',
    })
    declareScopes(null, ['billing:refund'])
    declareScopes('@acme/addon-unwired', ['unwired:manage'])
    declareScopes('@acme/addon-cloud', ['cloud:manage'])

    assert.deepEqual(await scopes(), ['admin', 'pikku:otlp:runs'])
  })

  test('holds collections when the app has collection functions, and only then', async () => {
    declareScopes(null, ['billing:refund'], ['collectionExport:run'])
    assert.deepEqual(await scopes(), ['admin', 'pikku:otlp:runs'])

    resetPikkuState()
    declareScopes(null, [
      'collections:offering:read',
      'collections:offering:edit',
    ])
    assert.deepEqual(await scopes(), [
      'admin',
      'pikku:otlp:runs',
      'collections',
    ])
  })
})
