import { describe, test } from 'node:test'
import assert from 'node:assert'
import { defaultPikkuUserIdResolver } from './pikku-user-id.js'
import type { PikkuWire } from '../types/core.types.js'

describe('defaultPikkuUserIdResolver', () => {
  test('should return pikkuUserId from wire', () => {
    const wire: PikkuWire = { pikkuUserId: 'user-1' }
    assert.strictEqual(defaultPikkuUserIdResolver(wire), 'user-1')
  })

  test('should return userId from session', () => {
    const wire: PikkuWire = { session: { userId: 'session-user' } as any }
    assert.strictEqual(defaultPikkuUserIdResolver(wire), 'session-user')
  })

  test('should prefer pikkuUserId over session', () => {
    const wire: PikkuWire = {
      pikkuUserId: 'explicit',
      session: { userId: 'session-user' } as any,
    }
    assert.strictEqual(defaultPikkuUserIdResolver(wire), 'explicit')
  })

  test('should return pikkuUserId from queue', () => {
    const wire: PikkuWire = {
      queue: {
        queueName: 'test',
        jobId: '1',
        pikkuUserId: 'queue-user',
        updateProgress: async () => {},
        fail: async () => {},
        discard: async () => {},
      },
    }
    assert.strictEqual(defaultPikkuUserIdResolver(wire), 'queue-user')
  })

  test('should return pikkuUserId from workflow', () => {
    const wire: PikkuWire = {
      workflow: {
        name: 'test',
        runId: '1',
        pikkuUserId: 'workflow-user',
        getRun: async () => ({}) as any,
        do: (() => {}) as any,
        sleep: (() => {}) as any,
      } as any,
    }
    assert.strictEqual(defaultPikkuUserIdResolver(wire), 'workflow-user')
  })

  test('should return undefined when no identity source', () => {
    const wire: PikkuWire = {}
    assert.strictEqual(defaultPikkuUserIdResolver(wire), undefined)
  })

  test('should ignore non-string session userId', () => {
    const wire: PikkuWire = { session: { userId: 123 } as any }
    assert.strictEqual(defaultPikkuUserIdResolver(wire), undefined)
  })
})
