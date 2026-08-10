import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `credentialService`. Runs only when a backend supplies one. */
export const defineCredentialServiceTests = (
  name: string,
  credentialService: NonNullable<
    ServiceTestConfig['services']['credentialService']
  >
): void => {
  const factory = credentialService
  const kek = 'test-key-encryption-key-32chars!'

  describe(`CredentialService [${name}]`, () => {
    test('set and get (global)', async () => {
      const service = await factory({ key: kek })
      await service.set('stripe', { apiKey: 'sk-123' })
      const result = await service.get<{ apiKey: string }>('stripe')
      assert.deepEqual(result, { apiKey: 'sk-123' })
    })

    test('get returns null for missing', async () => {
      const service = await factory({ key: kek })
      const result = await service.get('nonexistent')
      assert.equal(result, null)
    })

    test('has returns true/false', async () => {
      const service = await factory({ key: kek })
      await service.set('exists', { key: 'val' })
      assert.strictEqual(await service.has('exists'), true)
      assert.strictEqual(await service.has('nope'), false)
    })

    test('set upserts existing credential', async () => {
      const service = await factory({ key: kek })
      await service.set('upsert', { v: 1 })
      await service.set('upsert', { v: 2 })
      const result = await service.get<{ v: number }>('upsert')
      assert.deepEqual(result, { v: 2 })
    })

    test('delete removes credential', async () => {
      const service = await factory({ key: kek })
      await service.set('to-delete', { bye: true })
      assert.strictEqual(await service.has('to-delete'), true)
      await service.delete('to-delete')
      assert.strictEqual(await service.has('to-delete'), false)
    })

    test('per-user isolation', async () => {
      const service = await factory({ key: kek })
      await service.set('token', { access: 'user1' }, 'user-1')
      await service.set('token', { access: 'user2' }, 'user-2')

      const u1 = await service.get<{ access: string }>('token', 'user-1')
      const u2 = await service.get<{ access: string }>('token', 'user-2')
      assert.deepEqual(u1, { access: 'user1' })
      assert.deepEqual(u2, { access: 'user2' })
    })

    test('per-user delete does not affect other users', async () => {
      const service = await factory({ key: kek })
      await service.set('cred', { val: 'a' }, 'user-a')
      await service.set('cred', { val: 'b' }, 'user-b')

      await service.delete('cred', 'user-a')
      assert.strictEqual(await service.has('cred', 'user-a'), false)
      assert.strictEqual(await service.has('cred', 'user-b'), true)
    })

    test('global and per-user are separate', async () => {
      const service = await factory({ key: kek })
      await service.set('shared', { scope: 'global' })
      await service.set('shared', { scope: 'user' }, 'user-1')

      const global = await service.get<{ scope: string }>('shared')
      const perUser = await service.get<{ scope: string }>('shared', 'user-1')
      assert.deepEqual(global, { scope: 'global' })
      assert.deepEqual(perUser, { scope: 'user' })
    })

    test('getAll returns all credentials for a user', async () => {
      const service = await factory({ key: kek })
      await service.set('cred-a', { a: 1 }, 'user-x')
      await service.set('cred-b', { b: 2 }, 'user-x')
      await service.set('cred-c', { c: 3 }, 'user-y')

      const all = await service.getAll('user-x')
      assert.deepEqual(all['cred-a'], { a: 1 })
      assert.deepEqual(all['cred-b'], { b: 2 })
      assert.strictEqual(all['cred-c'], undefined)
    })

    test('getAll returns empty for unknown user', async () => {
      const service = await factory({ key: kek })
      const all = await service.getAll('nobody')
      assert.deepEqual(all, {})
    })

    test('rotateKEK re-wraps all credentials', async () => {
      const newKEK = 'new-key-encryption-key-rotated!'
      const oldService = await factory({ key: kek })
      await oldService.set('rotate-cred', { important: 'data' }, 'user-r')

      const rotatedService = await factory({
        key: newKEK,
        keyVersion: 2,
        previousKey: kek,
      })

      const before = await rotatedService.get<{ important: string }>(
        'rotate-cred',
        'user-r'
      )
      assert.deepEqual(before, { important: 'data' })

      assert.ok(rotatedService.rotateKEK)
      const count = await rotatedService.rotateKEK!()
      assert.ok(count > 0)

      const newOnlyService = await factory({
        key: newKEK,
        keyVersion: 2,
      })
      const after = await newOnlyService.get<{ important: string }>(
        'rotate-cred',
        'user-r'
      )
      assert.deepEqual(after, { important: 'data' })
    })

    test('rotateKEK throws without previousKey', async () => {
      const service = await factory({ key: kek })
      assert.ok(service.rotateKEK)
      await assert.rejects(() => service.rotateKEK!(), {
        message: 'No previousKey configured — nothing to rotate from',
      })
    })
  })
}
