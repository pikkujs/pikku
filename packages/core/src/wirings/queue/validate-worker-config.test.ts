import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateWorkerConfig } from './validate-worker-config.js'
import type { QueueConfigMapping } from './validate-worker-config.js'

const createTestMapping = (): QueueConfigMapping => ({
  supported: {
    concurrency: {
      queueProperty: 'concurrency',
      description: 'Number of concurrent workers',
    },
    maxRetries: {
      queueProperty: 'maxRetries',
      description: 'Maximum retry attempts',
    },
  },
  unsupported: {
    rateLimitMax: {
      reason: 'Not supported',
      explanation: 'This queue does not support rate limiting',
    },
  },
  fallbacks: {
    retryDelay: {
      reason: 'Partial support',
      explanation: 'Uses fixed delay instead of exponential',
      fallbackValue: '1000ms fixed',
    },
  },
})

describe('validateWorkerConfig', () => {
  test('should return empty results for empty config', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping, {})
    assert.deepStrictEqual(result.applied, {})
    assert.deepStrictEqual(result.ignored, {})
    assert.deepStrictEqual(result.warnings, [])
    assert.deepStrictEqual(result.fallbacks, {})
  })

  test('should return empty results for undefined config', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping)
    assert.deepStrictEqual(result.applied, {})
    assert.deepStrictEqual(result.ignored, {})
  })

  test('should apply supported configurations', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping, { concurrency: 5 } as any)
    assert.deepStrictEqual(result.applied, { concurrency: 5 })
    assert.deepStrictEqual(result.ignored, {})
    assert.strictEqual(result.warnings.length, 0)
  })

  test('should ignore unsupported configurations with warning', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping, { rateLimitMax: 100 } as any)
    assert.deepStrictEqual(result.ignored, { rateLimitMax: 100 })
    assert.strictEqual(result.warnings.length, 1)
    assert.ok(result.warnings[0].includes('Not supported'))
  })

  test('should handle fallback configurations', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping, { retryDelay: 2000 } as any)
    assert.deepStrictEqual(result.applied, { retryDelay: 2000 })
    assert.deepStrictEqual(result.fallbacks, { retryDelay: '1000ms fixed' })
    assert.strictEqual(result.warnings.length, 1)
    assert.ok(result.warnings[0].includes('Partial support'))
  })

  test('should warn about unknown configurations', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping, {
      unknownOption: 'val',
    } as any)
    assert.deepStrictEqual(result.ignored, { unknownOption: 'val' })
    assert.strictEqual(result.warnings.length, 1)
    assert.ok(result.warnings[0].includes('Unknown configuration'))
  })

  test('should skip undefined values', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping, {
      concurrency: undefined,
    } as any)
    assert.deepStrictEqual(result.applied, {})
  })

  test('should handle mixed supported and unsupported configs', () => {
    const mapping = createTestMapping()
    const result = validateWorkerConfig(mapping, {
      concurrency: 3,
      maxRetries: 5,
      rateLimitMax: 100,
      retryDelay: 1000,
    } as any)
    assert.deepStrictEqual(result.applied, {
      concurrency: 3,
      maxRetries: 5,
      retryDelay: 1000,
    })
    assert.deepStrictEqual(result.ignored, { rateLimitMax: 100 })
    assert.strictEqual(result.warnings.length, 2)
  })
})
