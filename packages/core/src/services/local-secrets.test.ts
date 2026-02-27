import { describe, test } from 'node:test'
import assert from 'node:assert'
import { LocalSecretService } from './local-secrets.js'
import { LocalVariablesService } from './local-variables.js'

describe('LocalSecretService', () => {
  test('should get secret from local storage', async () => {
    const service = new LocalSecretService()
    await service.setSecretJSON('MY_KEY', { token: 'abc' })
    const result = await service.getSecret('MY_KEY')
    assert.strictEqual(result, '{"token":"abc"}')
  })

  test('should get secret from environment variables', async () => {
    const vars = new LocalVariablesService({ MY_SECRET: 'secret-value' })
    const service = new LocalSecretService(vars)
    const result = await service.getSecret('MY_SECRET')
    assert.strictEqual(result, 'secret-value')
  })

  test('should throw when secret not found', async () => {
    const vars = new LocalVariablesService({})
    const service = new LocalSecretService(vars)
    await assert.rejects(() => service.getSecret('MISSING'), {
      message: 'Secret Not Found: MISSING',
    })
  })

  test('should get JSON secret from local storage', async () => {
    const service = new LocalSecretService()
    await service.setSecretJSON('JSON_KEY', { data: 42 })
    const result = await service.getSecretJSON('JSON_KEY')
    assert.deepStrictEqual(result, { data: 42 })
  })

  test('should get JSON secret from environment variables', async () => {
    const vars = new LocalVariablesService({ CONFIG: '{"port":3000}' })
    const service = new LocalSecretService(vars)
    const result = await service.getSecretJSON('CONFIG')
    assert.deepStrictEqual(result, { port: 3000 })
  })

  test('should throw when JSON secret not found', async () => {
    const vars = new LocalVariablesService({})
    const service = new LocalSecretService(vars)
    await assert.rejects(() => service.getSecretJSON('MISSING'), {
      message: 'Secret Not Found: MISSING',
    })
  })

  test('should prefer local storage over env variables', async () => {
    const vars = new LocalVariablesService({ KEY: 'env-value' })
    const service = new LocalSecretService(vars)
    await service.setSecretJSON('KEY', 'local-value')
    const result = await service.getSecret('KEY')
    assert.strictEqual(result, '"local-value"')
  })

  test('should check hasSecret in local storage', async () => {
    const vars = new LocalVariablesService({})
    const service = new LocalSecretService(vars)
    await service.setSecretJSON('EXISTS', 'yes')
    assert.strictEqual(await service.hasSecret('EXISTS'), true)
    assert.strictEqual(await service.hasSecret('NOPE'), false)
  })

  test('should check hasSecret in environment', async () => {
    const vars = new LocalVariablesService({ ENV_KEY: 'val' })
    const service = new LocalSecretService(vars)
    assert.strictEqual(await service.hasSecret('ENV_KEY'), true)
  })

  test('should delete secret from local storage', async () => {
    const service = new LocalSecretService()
    await service.setSecretJSON('DEL_KEY', 'value')
    assert.strictEqual(await service.hasSecret('DEL_KEY'), true)
    await service.deleteSecret('DEL_KEY')
    assert.strictEqual(await service.hasSecret('DEL_KEY'), false)
  })
})
