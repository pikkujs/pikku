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

    await s1.setSecretJSON('shared-name', { from: 'app1' })
    await s2.setSecretJSON('shared-name', { from: 'app2' })

    const r1 = await s1.getSecretJSON<{ from: string }>('shared-name')
    const r2 = await s2.getSecretJSON<{ from: string }>('shared-name')

    assert.deepEqual(r1, { from: 'app1' })
    assert.deepEqual(r2, { from: 'app2' })
    prefixRedis.disconnect()
  })
})
