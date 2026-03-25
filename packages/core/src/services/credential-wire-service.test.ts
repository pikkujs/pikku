import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  PikkuCredentialWireService,
  createMiddlewareCredentialWireProps,
  createWireServicesCredentialWireProps,
} from './credential-wire-service.js'
import type { CredentialService } from './credential-service.js'
import type { PikkuWire } from '../types/core.types.js'

const mockCredentialService = (
  creds: Record<string, unknown>
): CredentialService => ({
  get: async (name: string) => creds[name] ?? null,
  set: async () => {},
  delete: async () => {},
  has: async (name: string) => name in creds,
  getAll: async () => creds,
})

describe('PikkuCredentialWireService', () => {
  test('should set and get credentials manually', async () => {
    const service = new PikkuCredentialWireService()
    service.set('stripe', { apiKey: 'sk_test' })
    const result = await service.getAll()
    assert.deepStrictEqual(result, { stripe: { apiKey: 'sk_test' } })
  })

  test('should return sync after first load (no credential service)', async () => {
    const service = new PikkuCredentialWireService()
    service.set('foo', 'bar')
    // First call triggers lazy load (no-op without credentialService)
    await service.getAll()
    // Second call should be sync
    const result = service.getAll()
    assert.ok(!(result instanceof Promise), 'expected sync return')
    assert.deepStrictEqual(result, { foo: 'bar' })
  })

  test('should lazy-load from credential service on first getAll', async () => {
    const credService = mockCredentialService({
      stripe: { apiKey: 'sk_live' },
      github: { token: 'ghp_abc' },
    })
    const wire: PikkuWire = { session: { userId: 'user-1' } as any }
    const service = new PikkuCredentialWireService(credService, wire)

    const result = await service.getAll()
    assert.deepStrictEqual(result, {
      stripe: { apiKey: 'sk_live' },
      github: { token: 'ghp_abc' },
    })
  })

  test('should set pikkuUserId on wire after lazy load', async () => {
    const credService = mockCredentialService({})
    const wire: PikkuWire = { session: { userId: 'user-1' } as any }
    const service = new PikkuCredentialWireService(credService, wire)

    await service.getAll()
    assert.strictEqual(wire.pikkuUserId, 'user-1')
  })

  test('should not overwrite manually set credentials during lazy load', async () => {
    const credService = mockCredentialService({
      stripe: { apiKey: 'from-db' },
    })
    const wire: PikkuWire = { session: { userId: 'user-1' } as any }
    const service = new PikkuCredentialWireService(credService, wire)

    service.set('stripe', { apiKey: 'from-middleware' })
    const result = await service.getAll()
    assert.deepStrictEqual(result.stripe, { apiKey: 'from-middleware' })
  })

  test('should return sync on subsequent calls after lazy load', async () => {
    const credService = mockCredentialService({ stripe: { key: '123' } })
    const wire: PikkuWire = { session: { userId: 'user-1' } as any }
    const service = new PikkuCredentialWireService(credService, wire)

    await service.getAll()
    const result = service.getAll()
    assert.ok(!(result instanceof Promise), 'expected sync return')
    assert.deepStrictEqual(result, { stripe: { key: '123' } })
  })

  test('should not load when no userId resolvable', async () => {
    let called = false
    const credService: CredentialService = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      has: async () => false,
      getAll: async () => {
        called = true
        return {}
      },
    }
    const wire: PikkuWire = {}
    const service = new PikkuCredentialWireService(credService, wire)

    const result = await service.getAll()
    assert.deepStrictEqual(result, {})
    assert.strictEqual(called, false)
  })

  test('should deduplicate concurrent lazy load calls', async () => {
    let callCount = 0
    const credService: CredentialService = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      has: async () => false,
      getAll: async () => {
        callCount++
        return { stripe: { key: 'test' } }
      },
    }
    const wire: PikkuWire = { session: { userId: 'user-1' } as any }
    const service = new PikkuCredentialWireService(credService, wire)

    const [r1, r2] = await Promise.all([service.getAll(), service.getAll()])
    assert.strictEqual(callCount, 1)
    assert.deepStrictEqual(r1, r2)
  })

  test('getScoped should only return allowed names', async () => {
    const credService = mockCredentialService({
      stripe: { key: '1' },
      github: { token: '2' },
      slack: { webhook: '3' },
    })
    const wire: PikkuWire = { session: { userId: 'user-1' } as any }
    const service = new PikkuCredentialWireService(credService, wire)

    const result = await service.getScoped(['stripe', 'slack'])
    assert.deepStrictEqual(result, {
      stripe: { key: '1' },
      slack: { webhook: '3' },
    })
  })
})

describe('createMiddlewareCredentialWireProps', () => {
  test('should provide setCredential that writes to service', async () => {
    const service = new PikkuCredentialWireService()
    const props = createMiddlewareCredentialWireProps(service)
    props.setCredential('stripe', { apiKey: 'test' })
    const result = await service.getAll()
    assert.deepStrictEqual(result, { stripe: { apiKey: 'test' } })
  })
})

describe('createWireServicesCredentialWireProps', () => {
  test('should provide both setCredential and getCredentials', async () => {
    const service = new PikkuCredentialWireService()
    const props = createWireServicesCredentialWireProps(service)
    props.setCredential('stripe', { apiKey: 'test' })
    const result = await props.getCredentials()
    assert.deepStrictEqual(result, { stripe: { apiKey: 'test' } })
  })

  test('should scope getCredentials when allowedNames provided', async () => {
    const credService = mockCredentialService({
      stripe: { key: '1' },
      github: { token: '2' },
    })
    const wire: PikkuWire = { session: { userId: 'user-1' } as any }
    const service = new PikkuCredentialWireService(credService, wire)
    const props = createWireServicesCredentialWireProps(service, ['stripe'])
    const result = await props.getCredentials()
    assert.deepStrictEqual(result, { stripe: { key: '1' } })
  })
})
