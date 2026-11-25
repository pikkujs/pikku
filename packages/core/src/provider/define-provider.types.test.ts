import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { defineProvider, defineWireProvider } from './define-provider.js'
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

  test('a wire provider takes the singletons and the wire, and optional needs are listed', () => {
    const provider = defineWireProvider({
      optional: ['auditLog'],
      common: (services: { auditLog?: { write(): void } }, wire) => ({
        events: services.auditLog !== undefined && wire.session === undefined,
      }),
    })
    assert.deepEqual(provider.optional, ['auditLog'])
    // @ts-expect-error a wire provider has no onServerStart
    defineWireProvider({ onServerStart: () => {}, common: () => ({ a: 1 }) })
    // @ts-expect-error a wire provider cannot add to a collection
    defineWireProvider({ addTo: {}, common: () => ({ a: 1 }) })
  })
})

describe('the env a variant receives', () => {
  test('a worker variant reads bindings, the others read strings', () => {
    const provider = defineProvider({
      'deploy:cloudflare-worker': (_services, env) => {
        // @ts-expect-error a binding is not a string
        const asString: string | undefined = env.DB
        return { db: env.DB, asString }
      },
      'deploy:standalone': (_services, env) => ({
        db: env.DB_URL?.length ?? 0,
      }),
      dev: (_services, env) => ({
        // @ts-expect-error a string env has no binding members
        db: env.DB.prepare('select 1'),
      }),
    })
    assert.equal(typeof provider['deploy:cloudflare-worker'], 'function')
  })
})
