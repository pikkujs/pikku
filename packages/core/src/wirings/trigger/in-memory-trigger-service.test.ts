import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { wireTrigger, wireTriggerSource } from './trigger-runner.js'
import { InMemoryTriggerService } from './in-memory-trigger-service.js'
import type { TriggerInvokeOptions } from './trigger.types.js'

type Invoke = (data: unknown, options?: TriggerInvokeOptions) => void

const errors: string[] = []
const logger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: (message: string) => {
    errors.push(message)
  },
}

/** What the trigger's target saw on each fire. */
type Seen = { userId?: string; token: unknown; session: unknown }

/**
 * Wires a source that hands its `invoke` to the test, and a target that
 * records the user it ran as and the `type: 'wire'` credential that resolved
 * for that user.
 */
const setup = (targetMeta: Record<string, unknown> = { sessionless: true }) => {
  const seen: Seen[] = []
  let invoke: Invoke | undefined

  pikkuState(null, 'function', 'meta').onMessageSource = {
    pikkuFuncId: 'onMessageSource',
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  } as any
  pikkuState(null, 'function', 'meta').handleMessage = {
    pikkuFuncId: 'handleMessage',
    inputSchemaName: null,
    outputSchemaName: null,
    ...targetMeta,
  } as any
  pikkuState(null, 'trigger', 'meta').onMessage = {
    name: 'onMessage',
    pikkuFuncId: 'handleMessage',
  } as any
  pikkuState(null, 'trigger', 'sourceMeta').onMessage = {
    name: 'onMessage',
    pikkuFuncId: 'onMessageSource',
  }

  wireTrigger({
    name: 'onMessage',
    func: {
      func: async (_services: any, _data: any, wire: any) => {
        seen.push({
          userId: wire.pikkuUserId,
          token: await wire.getCredential('mailbox'),
          session: wire.session,
        })
      },
    },
  })
  wireTriggerSource({
    name: 'onMessage',
    func: {
      func: async (_services, _input, { trigger }) => {
        invoke = trigger.invoke
        return () => {}
      },
    },
  })

  return {
    seen,
    fire: async (data: unknown, options?: TriggerInvokeOptions) => {
      assert.ok(invoke, `the source never started: ${errors.join('; ')}`)
      invoke(data, options)
      // `invoke` is fire-and-forget; let the target's invocation settle.
      await new Promise((resolve) => setTimeout(resolve, 10))
    },
  }
}

describe('a trigger event that names its user', () => {
  beforeEach(() => {
    resetPikkuState()
    errors.length = 0
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      credentialService: {
        getAll: async (userId: string) => ({ mailbox: `token-of-${userId}` }),
        get: async () => null,
      },
      sessionStore: {
        get: async (userId: string) => ({ userId, scopes: [] }),
        set: async () => {},
        clear: async () => {},
      },
    } as any)
  })

  test("runs the target as that user, resolving that user's wire credential", async () => {
    const { seen, fire } = setup()
    await new InMemoryTriggerService().start()

    await fire({ id: 1 }, { pikkuUserId: 'alice' })
    await fire({ id: 2 }, { pikkuUserId: 'bob' })

    assert.deepStrictEqual(
      seen.map(({ userId, token }) => ({ userId, token })),
      [
        { userId: 'alice', token: 'token-of-alice' },
        { userId: 'bob', token: 'token-of-bob' },
      ]
    )
  })

  test('a target that requires a session gets the stored session of that user', async () => {
    const { seen, fire } = setup({ sessionless: false })
    await new InMemoryTriggerService().start()

    await fire({ id: 1 }, { pikkuUserId: 'alice' })

    assert.deepStrictEqual(seen[0]?.session, { userId: 'alice', scopes: [] })
  })

  test('an event with no user runs the target as nobody', async () => {
    const { seen, fire } = setup()
    await new InMemoryTriggerService().start()

    await fire({ id: 1 })

    assert.deepStrictEqual(seen, [
      { userId: undefined, token: null, session: undefined },
    ])
  })

  test('the event data cannot pick the user', async () => {
    const { seen, fire } = setup()
    await new InMemoryTriggerService().start()

    await fire({ pikkuUserId: 'mallory', userId: 'mallory' })

    assert.strictEqual(seen[0]?.userId, undefined)
    assert.strictEqual(seen[0]?.token, null)
  })

  test('an invalid user drops the event rather than running it as nobody', async () => {
    const { seen, fire } = setup()
    await new InMemoryTriggerService().start()

    await fire({ id: 1 }, { pikkuUserId: '' })
    await fire({ id: 2 }, { pikkuUserId: { id: 'alice' } as any })

    assert.deepStrictEqual(seen, [])
    assert.strictEqual(errors.length, 2)
    assert.match(errors[0]!, /invalid pikkuUserId/)
  })
})
