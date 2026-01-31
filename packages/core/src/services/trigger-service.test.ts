import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import { InMemoryTriggerService } from './trigger-service.js'
import type { CoreSingletonServices } from '../types/core.types.js'
import {
  wireTrigger,
  wireTriggerSource,
} from '../wirings/trigger/trigger-runner.js'
import { rpcService } from '../wirings/rpc/rpc-runner.js'

// ============================================
// Helpers
// ============================================

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

const createMockServices = (logger?: ReturnType<typeof createMockLogger>) => {
  return {
    logger: logger ?? createMockLogger(),
  } as any as CoreSingletonServices
}

const createService = (mockServices: CoreSingletonServices) => {
  const service = new InMemoryTriggerService()
  service.setServices(mockServices)
  return service
}

const setupTriggerMeta = (name: string) => {
  pikkuState(null, 'trigger', 'meta')[name] = {
    pikkuFuncName: `trigger_${name}`,
    name,
  }
  pikkuState(null, 'function', 'meta')[`trigger_${name}`] = {
    pikkuFuncName: `trigger_${name}`,
    inputSchemaName: null,
    outputSchemaName: null,
  }
  // Simulate CLI build-time output: pre-populate function.meta for the source
  pikkuState(null, 'function', 'meta')[`trigger_${name}__source`] = {
    pikkuFuncName: `trigger_${name}__source`,
    inputSchemaName: null,
    outputSchemaName: null,
  }
}

/**
 * Wire a mock trigger (declaration) and source together
 */
const wireMockTriggerWithSource = (
  name: string,
  options?: { fireOnSetup?: unknown; input?: unknown }
) => {
  setupTriggerMeta(name)

  wireTrigger({
    name,
    func: { func: async () => {} },
  })

  wireTriggerSource({
    name,
    func: {
      func: async (_services: any, _input: any, wire: any) => {
        if (options?.fireOnSetup !== undefined) {
          wire.trigger.invoke(options.fireOnSetup)
        }
        return () => {}
      },
    },
    input: options?.input ?? {},
  })
}

// ============================================
// Tests
// ============================================

let service: InMemoryTriggerService
const afterCleanups: Array<() => void> = []

beforeEach(() => {
  resetPikkuState()
})

afterEach(async () => {
  if (service) {
    await service.stop()
  }
  for (const cleanup of afterCleanups) {
    cleanup()
  }
  afterCleanups.length = 0
})

describe('InMemoryTriggerService.start', () => {
  test('should do nothing when no trigger sources exist', async () => {
    const mockLogger = createMockLogger()
    service = createService(createMockServices(mockLogger))

    await service.start()

    const logs = mockLogger.getLogs()
    assert(logs.some((l) => l.message.includes('No triggers started')))
  })

  test('should start a trigger that has both declaration and source', async () => {
    const mockLogger = createMockLogger()
    service = createService(createMockServices(mockLogger))

    wireMockTriggerWithSource('test-trigger')

    await service.start()

    const logs = mockLogger.getLogs()
    assert(
      logs.some((l) => l.message.includes('Started trigger: test-trigger'))
    )
  })

  test('should skip sources without targets', async () => {
    const mockLogger = createMockLogger()
    service = createService(createMockServices(mockLogger))

    // Only register a source, no wireTrigger declaration
    setupTriggerMeta('orphan-source')
    wireTriggerSource({
      name: 'orphan-source',
      func: {
        func: async () => () => {},
      },
      input: {},
    })

    await service.start()

    const logs = mockLogger.getLogs()
    assert(logs.some((l) => l.message.includes('has no targets, skipping')))
  })

  test('should not start a trigger that is already active', async () => {
    const mockLogger = createMockLogger()
    service = createService(createMockServices(mockLogger))

    wireMockTriggerWithSource('test-trigger')

    await service.start()
    const startCount1 = mockLogger
      .getLogs()
      .filter((l) => l.message.includes('Started trigger:')).length

    // Start again
    await service.start()
    const startCount2 = mockLogger
      .getLogs()
      .filter((l) => l.message.includes('Started trigger:')).length

    // Should not have started again
    assert.equal(startCount1, startCount2)
  })

  test('should throw when setServices not called', async () => {
    service = new InMemoryTriggerService()
    await assert.rejects(() => service.start(), /requires singletonServices/)
  })
})

describe('InMemoryTriggerService.stop', () => {
  test('should tear down all active triggers', async () => {
    let tornDown = false

    setupTriggerMeta('stop-trigger')
    wireTrigger({
      name: 'stop-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'stop-trigger',
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
    service = createService(createMockServices(mockLogger))

    await service.start()
    await service.stop()
    assert.equal(tornDown, true)

    const logs = mockLogger.getLogs()
    assert(logs.some((l) => l.message.includes('Stopped trigger:')))
  })

  test('should be safe to call stop when nothing is started', async () => {
    service = createService(createMockServices())

    // Should not throw
    await service.stop()
  })
})

describe('InMemoryTriggerService.onTriggerFire', () => {
  test('should invoke RPC targets when trigger fires', async () => {
    let rpcInvoked = false
    let rpcData: any

    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = createService(mockServices)

    const origGetContextRPCService =
      rpcService.getContextRPCService.bind(rpcService)
    rpcService.getContextRPCService = (() => ({
      invoke: async (_name: string, data: any) => {
        rpcInvoked = true
        rpcData = data
      },
      startWorkflow: async () => ({ runId: 'test' }),
    })) as any
    afterCleanups.push(() => {
      rpcService.getContextRPCService = origGetContextRPCService
    })

    // Wire a trigger that fires on setup
    setupTriggerMeta('fire-trigger')
    wireTrigger({
      name: 'fire-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'fire-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ message: 'hello' }), 10)
          return () => {}
        },
      },
      input: { channel: 'test' },
    })

    await service.start()

    // Wait for the async trigger fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(rpcInvoked, true)
    assert.deepEqual(rpcData, { message: 'hello' })
  })

  test('should log errors when target invocation fails', async () => {
    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = createService(mockServices)

    const origGetContextRPCService =
      rpcService.getContextRPCService.bind(rpcService)
    rpcService.getContextRPCService = (() => ({
      invoke: async () => {
        throw new Error('RPC failed')
      },
      startWorkflow: async () => ({ runId: 'test' }),
    })) as any
    afterCleanups.push(() => {
      rpcService.getContextRPCService = origGetContextRPCService
    })

    setupTriggerMeta('error-trigger')
    wireTrigger({
      name: 'error-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'error-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ data: 'test' }), 10)
          return () => {}
        },
      },
      input: { channel: 'test' },
    })

    await service.start()

    await new Promise((resolve) => setTimeout(resolve, 50))

    const logs = mockLogger.getLogs()
    assert(
      logs.some(
        (l) => l.level === 'error' && l.message.includes('Error invoking')
      )
    )
  })
})

describe('InMemoryTriggerService auto-registration', () => {
  test('start() auto-starts workflow trigger wires when source exists', async () => {
    let workflowStarted = false
    let startedWorkflowName: string | undefined

    const mockLogger = createMockLogger()
    const mockServices = { logger: mockLogger } as any

    service = createService(mockServices)

    const origGetContextRPCService =
      rpcService.getContextRPCService.bind(rpcService)
    rpcService.getContextRPCService = (() => ({
      invoke: async () => {},
      startWorkflow: async (name: string) => {
        workflowStarted = true
        startedWorkflowName = name
        return { runId: 'auto-run' }
      },
    })) as any
    afterCleanups.push(() => {
      rpcService.getContextRPCService = origGetContextRPCService
    })

    // Register workflow with trigger wire in workflows.meta
    const workflowsMeta = pikkuState(null, 'workflows', 'meta')
    workflowsMeta['autoFireWorkflow'] = {
      name: 'autoFireWorkflow',
      pikkuFuncName: 'autoFireWorkflow',
      wires: {
        trigger: [{ name: 'auto-fire-trigger', startNode: 'begin' }],
      },
    }

    // Wire the trigger source (subscription function)
    setupTriggerMeta('auto-fire-trigger')
    wireTrigger({
      name: 'auto-fire-trigger',
      func: { func: async () => {} },
    })
    wireTriggerSource({
      name: 'auto-fire-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ payload: 'test' }), 10)
          return () => {}
        },
      },
      input: { chan: 'x' },
    })

    await service.start()

    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(workflowStarted, true)
    assert.equal(startedWorkflowName, 'autoFireWorkflow')
  })
})
