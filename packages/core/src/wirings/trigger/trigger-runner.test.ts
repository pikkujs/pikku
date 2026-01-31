import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  wireTrigger,
  wireTriggerSource,
  setupTrigger,
  getRegisteredTriggers,
} from './trigger-runner.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import type { CoreTrigger } from './trigger.types.js'

beforeEach(() => {
  resetPikkuState()
})

const createMockLogger = () => {
  const logs: Array<{ level: string; message: string; error?: any }> = []
  return {
    info: (msg: string) => logs.push({ level: 'info', message: msg }),
    warn: (msg: string) => logs.push({ level: 'warn', message: msg }),
    error: (msg: string, error?: any) =>
      logs.push({ level: 'error', message: msg, error }),
    debug: (msg: string) => logs.push({ level: 'debug', message: msg }),
    getLogs: () => logs,
  }
}

const setupTriggerMeta = (name: string) => {
  pikkuState(null, 'trigger', 'meta')[name] = {
    pikkuFuncName: `trigger_${name}`,
    name,
  }
}

describe('wireTrigger', () => {
  test('should successfully wire a trigger', () => {
    const mockTrigger: CoreTrigger = {
      name: 'test-trigger',
      func: { func: async () => {} },
    }

    setupTriggerMeta('test-trigger')
    wireTrigger(mockTrigger)

    const triggers = pikkuState(null, 'trigger', 'triggers')
    assert.equal(triggers.has('test-trigger'), true)
  })

  test('should throw error when trigger metadata not found', () => {
    const mockTrigger: CoreTrigger = {
      name: 'missing-meta-trigger',
      func: { func: async () => {} },
    }

    assert.throws(
      () => wireTrigger(mockTrigger),
      (error: any) => {
        assert(error.message.includes('Trigger metadata not found'))
        return true
      }
    )
  })

  test('should throw error when trigger already exists', () => {
    const mockTrigger: CoreTrigger = {
      name: 'duplicate-trigger',
      func: { func: async () => {} },
    }

    setupTriggerMeta('duplicate-trigger')
    wireTrigger(mockTrigger)

    assert.throws(
      () => wireTrigger(mockTrigger),
      (error: any) => {
        assert(error.message.includes('Trigger already exists'))
        return true
      }
    )
  })

  test('should wire trigger with description and tags', () => {
    const mockTrigger: CoreTrigger = {
      name: 'tagged-trigger',
      func: { func: async () => {} },
      description: 'A test trigger',
      tags: ['redis', 'pubsub'],
    }

    setupTriggerMeta('tagged-trigger')
    wireTrigger(mockTrigger)

    const triggers = pikkuState(null, 'trigger', 'triggers')
    const trigger = triggers.get('tagged-trigger')
    assert.equal(trigger?.description, 'A test trigger')
    assert.deepEqual(trigger?.tags, ['redis', 'pubsub'])
  })
})

describe('setupTrigger', () => {
  test('should set up a trigger with input and invoke callback', async () => {
    let receivedInput: any
    let invokedData: any

    setupTriggerMeta('setup-trigger')
    wireTrigger({
      name: 'setup-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'setup-trigger',
      func: {
        func: async (services: any, input: any, wire: any) => {
          receivedInput = input
          wire.trigger.invoke({ message: 'hello' })
          return () => {}
        },
      },
      input: { channel: 'test-channel' },
    })

    const mockLogger = createMockLogger()
    const instance = await setupTrigger({
      name: 'setup-trigger',
      singletonServices: { logger: mockLogger } as any,
      input: { channel: 'test-channel' },
      onTrigger: (data) => {
        invokedData = data
      },
    })

    assert.equal(instance.name, 'setup-trigger')
    assert.deepEqual(receivedInput, { channel: 'test-channel' })
    assert.deepEqual(invokedData, { message: 'hello' })
  })

  test('should pass different inputs to the same trigger', async () => {
    const receivedInputs: any[] = []

    setupTriggerMeta('multi-input-trigger')
    wireTrigger({
      name: 'multi-input-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'multi-input-trigger',
      func: {
        func: async (services: any, input: any, wire: any) => {
          receivedInputs.push(input)
          return () => {}
        },
      },
      input: {},
    })

    const mockLogger = createMockLogger()

    await setupTrigger({
      name: 'multi-input-trigger',
      singletonServices: { logger: mockLogger } as any,
      input: { channel: 'channel-a' },
      onTrigger: () => {},
    })

    await setupTrigger({
      name: 'multi-input-trigger',
      singletonServices: { logger: mockLogger } as any,
      input: { channel: 'channel-b' },
      onTrigger: () => {},
    })

    assert.equal(receivedInputs.length, 2)
    assert.deepEqual(receivedInputs[0], { channel: 'channel-a' })
    assert.deepEqual(receivedInputs[1], { channel: 'channel-b' })
  })

  test('should throw when trigger source not found', async () => {
    const mockLogger = createMockLogger()

    await assert.rejects(
      async () => {
        await setupTrigger({
          name: 'non-existent',
          singletonServices: { logger: mockLogger } as any,
          input: {},
          onTrigger: () => {},
        })
      },
      (error: any) => {
        assert(error.message.includes('Trigger source not found'))
        return true
      }
    )
  })

  test('should throw when trigger metadata not found', async () => {
    // Add a trigger source without metadata
    pikkuState(null, 'trigger', 'triggerSources').set('no-meta', {
      name: 'no-meta',
      func: { func: async () => () => {} },
      input: {},
    } as any)

    const mockLogger = createMockLogger()

    await assert.rejects(
      async () => {
        await setupTrigger({
          name: 'no-meta',
          singletonServices: { logger: mockLogger } as any,
          input: {},
          onTrigger: () => {},
        })
      },
      (error: any) => {
        assert(error.message.includes('Trigger metadata not found'))
        return true
      }
    )
  })

  test('should return a teardown function', async () => {
    let tornDown = false

    setupTriggerMeta('teardown-trigger')
    wireTrigger({
      name: 'teardown-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'teardown-trigger',
      func: {
        func: async () => {
          return () => {
            tornDown = true
          }
        },
      },
      input: {},
    })

    const mockLogger = createMockLogger()
    const instance = await setupTrigger({
      name: 'teardown-trigger',
      singletonServices: { logger: mockLogger } as any,
      input: {},
      onTrigger: () => {},
    })

    assert.equal(typeof instance.teardown, 'function')
    await instance.teardown()
    assert.equal(tornDown, true)
  })

  test('should log setup and fire events', async () => {
    setupTriggerMeta('log-trigger')
    wireTrigger({
      name: 'log-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'log-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          wire.trigger.invoke({ data: 'test' })
          return () => {}
        },
      },
      input: {},
    })

    const mockLogger = createMockLogger()
    await setupTrigger({
      name: 'log-trigger',
      singletonServices: { logger: mockLogger } as any,
      input: {},
      onTrigger: () => {},
    })

    const logs = mockLogger.getLogs()
    const infoLogs = logs.filter((l) => l.level === 'info')
    assert(
      infoLogs.some((l) =>
        l.message.includes('Setting up trigger: log-trigger')
      )
    )
    assert(
      infoLogs.some((l) => l.message.includes('Trigger fired: log-trigger'))
    )
  })
})

describe('getRegisteredTriggers', () => {
  test('should return the triggers map', () => {
    const mockTrigger: CoreTrigger = {
      name: 'registered-trigger',
      func: { func: async () => {} },
    }

    setupTriggerMeta('registered-trigger')
    wireTrigger(mockTrigger)

    const triggers = getRegisteredTriggers()
    assert.equal(triggers instanceof Map, true)
    assert.equal(triggers.has('registered-trigger'), true)
  })

  test('should return empty map when no triggers registered', () => {
    const triggers = getRegisteredTriggers()
    assert.equal(triggers instanceof Map, true)
    assert.equal(triggers.size, 0)
  })
})
