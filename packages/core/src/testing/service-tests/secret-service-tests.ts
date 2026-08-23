import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `secretService`. Runs only when a backend supplies one. */
export const defineSecretServiceTests = (
  name: string,
  secretService: NonNullable<ServiceTestConfig['services']['secretService']>
): void => {
  const factory = secretService
  const kek = 'test-key-encryption-key-32chars!'

  describe(`SecretService [${name}]`, () => {
    test('setSecret and getSecret', async () => {
      const service = await factory({ key: kek })
      await service.setSecret('api-key', {
        token: 'sk-123',
        endpoint: 'https://api.example.com',
      })
      const result = await service.getSecret<{
        token: string
        endpoint: string
      }>('api-key')
      assert.deepEqual(result.reveal(), {
        token: 'sk-123',
        endpoint: 'https://api.example.com',
      })
    })

    test('getSecret wraps the raw string rather than returning it', async () => {
      const service = await factory({ key: kek })
      await service.setSecret('string-secret', 'plain-value')
      const result = await service.getSecret('string-secret')
      assert.strictEqual(result.reveal(), 'plain-value')
    })

    test('hasSecret returns true/false', async () => {
      const service = await factory({ key: kek })
      assert.strictEqual(await service.hasSecret('api-key'), true)
      assert.strictEqual(await service.hasSecret('nonexistent'), false)
    })

    test('getSecret throws for missing key', async () => {
      const service = await factory({ key: kek })
      await assert.rejects(() => service.getSecret('nonexistent'), {
        message: 'Requested secret not found: nonexistent',
      })
    })

    test('setSecret upserts existing key', async () => {
      const service = await factory({ key: kek })
      await service.setSecret('upsert-key', { v: 1 })
      await service.setSecret('upsert-key', { v: 2 })
      const result = await service.getSecret<{ v: number }>('upsert-key')
      assert.deepEqual(result.reveal(), { v: 2 })
    })

    test('deleteSecret removes the key', async () => {
      const service = await factory({ key: kek })
      await service.setSecret('to-delete', 'bye')
      assert.strictEqual(await service.hasSecret('to-delete'), true)
      await service.deleteSecret('to-delete')
      assert.strictEqual(await service.hasSecret('to-delete'), false)
    })

    test('rotateKEK re-wraps all secrets', async () => {
      const newKEK = 'new-key-encryption-key-rotated!'
      const oldService = await factory({ key: kek })
      await oldService.setSecret('rotate-test', { important: 'data' })

      const rotatedService = await factory({
        key: newKEK,
        keyVersion: 2,
        previousKey: kek,
      })

      const before = await rotatedService.getSecret<{
        important: string
      }>('rotate-test')
      assert.deepEqual(before.reveal(), { important: 'data' })

      assert.ok(rotatedService.rotateKEK)
      const count = await rotatedService.rotateKEK!()
      assert.ok(count > 0)

      const newOnlyService = await factory({
        key: newKEK,
        keyVersion: 2,
      })
      const after = await newOnlyService.getSecret<{
        important: string
      }>('rotate-test')
      assert.deepEqual(after.reveal(), { important: 'data' })
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
