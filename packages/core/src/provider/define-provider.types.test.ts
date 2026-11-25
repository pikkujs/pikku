import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineProvider } from './define-provider.js'
import type { WithOptional } from './provider.types.js'

type Services = { logger: { info(): void }; queueService: { send(): void } }

describe('defineProvider optional needs', () => {
  test('WithOptional makes the listed keys possibly undefined', () => {
    const guard = (s: WithOptional<Services, 'queueService'>) => {
      s.queueService?.send()
      // @ts-expect-error an optional need may be undefined
      s.queueService.send()
      s.logger.info()
    }
    assert.equal(typeof guard, 'function')
  })

  test('an object form with optional keeps its variants', () => {
    const provider = defineProvider({
      optional: ['queueService'],
      common: ({ queueService }: Partial<Services>) => ({
        cache: queueService ? 1 : 0,
      }),
    })
    assert.deepEqual(provider.optional, ['queueService'])
  })
})
