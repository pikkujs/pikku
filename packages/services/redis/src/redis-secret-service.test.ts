import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import Redis from 'ioredis-mock'
import { defineServiceTests } from '@pikku/core/testing'
import { RedisSecretService } from './redis-secret-service.js'

describe('RedisSecretService', () => {
  let redis: InstanceType<typeof Redis>

  before(() => {
    redis = new Redis()
  })

  after(async () => {
    redis.disconnect()
  })

  defineServiceTests({
    name: 'Redis',
    services: {
      secretService: async (config) =>
        new RedisSecretService(redis as any, config),
    },
  })

  test('custom keyPrefix isolates secrets', async () => {
    const prefixRedis = new Redis()
    const kek = 'test-key-encryption-key-32chars!'
    const s1 = new RedisSecretService(prefixRedis as any, {
      key: kek,
      keyPrefix: 'app1',
    })
    const s2 = new RedisSecretService(prefixRedis as any, {
      key: kek,
      keyPrefix: 'app2',
    })

    await s1.setSecret('shared-name', { from: 'app1' })
    await s2.setSecret('shared-name', { from: 'app2' })

    const r1 = await s1.getSecret<{ from: string }>('shared-name')
    const r2 = await s2.getSecret<{ from: string }>('shared-name')

    assert.deepEqual(r1.reveal(), { from: 'app1' })
    assert.deepEqual(r2.reveal(), { from: 'app2' })
    prefixRedis.disconnect()
  })

  describe('decryption failures', () => {
    const kek = 'test-key-encryption-key-32chars!'
    const otherKek = 'a-totally-different-kek-32chars!'

    test('getSecrets throws naming a secret it cannot decrypt', async () => {
      const writer = new RedisSecretService(redis as any, { key: kek })
      await writer.setSecret('undecryptable', { token: 'abc' })

      const reader = new RedisSecretService(redis as any, { key: otherKek })

      await assert.rejects(
        () => reader.getSecrets(['undecryptable']),
        (error: Error) => {
          assert.equal(
            error.message,
            'Failed to decrypt secret "undecryptable" (key_version 1): ' +
              'the configured KEK does not match the key it was wrapped under'
          )
          assert.ok(error.cause, 'the underlying crypto failure is preserved')
          return true
        }
      )
    })

    test('getSecrets throws when no KEK is available for a stored key_version', async () => {
      const writer = new RedisSecretService(redis as any, {
        key: kek,
        keyVersion: 7,
      })
      await writer.setSecret('old-version', 'value')

      const reader = new RedisSecretService(redis as any, {
        key: kek,
        keyVersion: 8,
      })

      await assert.rejects(
        () => reader.getSecrets(['old-version']),
        (error: Error) => {
          assert.equal(
            error.message,
            'Failed to decrypt secret "old-version" (key_version 7): ' +
              'the configured KEK does not match the key it was wrapped under'
          )
          return true
        }
      )
    })

    test('getSecrets returns every secret when they all decrypt', async () => {
      const service = new RedisSecretService(redis as any, { key: kek })
      await service.setSecret('batch-a', { v: 1 })
      await service.setSecret('batch-b', 'two')

      const out = await service.getSecrets<{
        'batch-a': { v: number }
        'batch-b': string
      }>(['batch-a', 'batch-b'])

      assert.deepEqual(out['batch-a']!.reveal(), { v: 1 })
      assert.equal(out['batch-b']!.reveal(), 'two')
    })

    test('getSecrets omits keys that were never stored', async () => {
      const service = new RedisSecretService(redis as any, { key: kek })
      await service.setSecret('present', 'here')

      const out = await service.getSecrets(['present', 'never-stored'])

      assert.deepEqual(Object.keys(out), ['present'])
      assert.equal(out.present!.reveal(), 'here')
    })
  })
})
