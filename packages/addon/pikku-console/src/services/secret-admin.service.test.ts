import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SecretAdminService } from './secret-admin.service.js'

const secretValue = (value: unknown) => ({ reveal: () => value }) as any

const stubSecrets = (store: Record<string, unknown>) => {
  const calls: string[] = []
  const secrets = {
    calls,
    async hasSecret(key: string) {
      calls.push(`hasSecret:${key}`)
      return key in store
    },
    async getSecret(key: string) {
      calls.push(`getSecret:${key}`)
      if (!(key in store)) {
        throw new Error(`missing: ${key}`)
      }
      return secretValue(store[key])
    },
    async setSecret(key: string, value: unknown) {
      calls.push(`setSecret:${key}`)
      store[key] = value
    },
    async deleteSecret() {},
    async getSecrets() {
      return {}
    },
  }
  return secrets
}

describe('SecretAdminService', () => {
  test('reports an existing secret without reading its value', async () => {
    const secrets = stubSecrets({ STRIPE_KEY: 'sk_live' })
    const admin = new SecretAdminService(secrets as any)

    assert.equal(await admin.has('STRIPE_KEY'), true)
    assert.deepEqual(secrets.calls, ['hasSecret:STRIPE_KEY'])
  })

  test('reports a missing secret', async () => {
    const admin = new SecretAdminService(stubSecrets({}) as any)

    assert.equal(await admin.has('NOPE'), false)
  })

  test('reveals the value of an existing secret', async () => {
    const admin = new SecretAdminService(
      stubSecrets({ STRIPE_KEY: 'sk_live' }) as any
    )

    assert.deepEqual(await admin.read('STRIPE_KEY'), {
      exists: true,
      value: 'sk_live',
    })
  })

  test('reads a missing secret as absent rather than throwing', async () => {
    const admin = new SecretAdminService(stubSecrets({}) as any)

    assert.deepEqual(await admin.read('NOPE'), { exists: false, value: null })
  })

  test('writes a secret through to the underlying service', async () => {
    const store: Record<string, unknown> = {}
    const admin = new SecretAdminService(stubSecrets(store) as any)

    await admin.write('STRIPE_KEY', 'sk_test')

    assert.equal(store.STRIPE_KEY, 'sk_test')
  })

  test('administers an id it was never told about ahead of time', async () => {
    const store: Record<string, unknown> = {}
    const admin = new SecretAdminService(stubSecrets(store) as any)

    await admin.write('ARBITRARY_RUNTIME_ID', 'value')

    assert.deepEqual(await admin.read('ARBITRARY_RUNTIME_ID'), {
      exists: true,
      value: 'value',
    })
  })
})
