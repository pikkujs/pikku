import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import Redis from 'ioredis-mock'
import { RedisSecretService } from './redis-secret-service.js'

const kek = 'test-key-encryption-key-32chars!'

describe('RedisSecretService', () => {
  let redis: InstanceType<typeof Redis>

  before(() => {
    redis = new Redis()
  })

  after(async () => {
    redis.disconnect()
  })

  test('setSecretJSON and getSecretJSON', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    await service.setSecretJSON('api-key', {
      token: 'sk-123',
      endpoint: 'https://api.example.com',
    })
    const result = await service.getSecretJSON<{
      token: string
      endpoint: string
    }>('api-key')
    assert.deepEqual(result, {
      token: 'sk-123',
      endpoint: 'https://api.example.com',
    })
  })

  test('getSecret returns raw string', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    await service.setSecretJSON('string-secret', 'plain-value')
    const result = await service.getSecret('string-secret')
    assert.strictEqual(result, '"plain-value"')
  })

  test('hasSecret returns true for existing', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    await service.setSecretJSON('exists-key', 'val')
    assert.strictEqual(await service.hasSecret('exists-key'), true)
  })

  test('hasSecret returns false for missing', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    assert.strictEqual(await service.hasSecret('nonexistent'), false)
  })

  test('getSecret throws for missing key', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    await assert.rejects(() => service.getSecret('nonexistent'), {
      message: 'Secret not found: nonexistent',
    })
  })

  test('setSecretJSON upserts existing key', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    await service.setSecretJSON('upsert-key', { v: 1 })
    await service.setSecretJSON('upsert-key', { v: 2 })
    const result = await service.getSecretJSON<{ v: number }>('upsert-key')
    assert.deepEqual(result, { v: 2 })
  })

  test('deleteSecret removes the key', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    await service.setSecretJSON('to-delete', 'bye')
    assert.strictEqual(await service.hasSecret('to-delete'), true)
    await service.deleteSecret('to-delete')
    assert.strictEqual(await service.hasSecret('to-delete'), false)
  })

  test('rotateKEK re-wraps all secrets', async () => {
    const rotateRedis = new Redis()
    const newKEK = 'new-key-encryption-key-rotated!'

    const oldService = new RedisSecretService(rotateRedis as any, { key: kek })
    await oldService.setSecretJSON('rotate-test', { important: 'data' })

    const rotatedService = new RedisSecretService(rotateRedis as any, {
      key: newKEK,
      keyVersion: 2,
      previousKey: kek,
    })

    const before = await rotatedService.getSecretJSON<{ important: string }>(
      'rotate-test'
    )
    assert.deepEqual(before, { important: 'data' })

    const count = await rotatedService.rotateKEK()
    assert.ok(count > 0)

    const newOnlyService = new RedisSecretService(rotateRedis as any, {
      key: newKEK,
      keyVersion: 2,
    })
    const after = await newOnlyService.getSecretJSON<{ important: string }>(
      'rotate-test'
    )
    assert.deepEqual(after, { important: 'data' })
    rotateRedis.disconnect()
  })

  test('rotateKEK throws without previousKey', async () => {
    const service = new RedisSecretService(redis as any, { key: kek })
    await assert.rejects(() => service.rotateKEK(), {
      message: 'No previousKey configured — nothing to rotate from',
    })
  })

  test('custom keyPrefix isolates secrets', async () => {
    const prefixRedis = new Redis()
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
