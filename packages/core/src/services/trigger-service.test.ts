import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import {
  TriggerService,
  TriggerRegistration,
  TriggerInputInstance,
  generateInputHash,
} from './trigger-service.js'
import { InMemoryDeploymentService } from './in-memory-deployment-service.js'
import { InMemoryTriggerService } from './in-memory-trigger-service.js'
import type { CoreSingletonServices } from '../types/core.types.js'
import { wireTrigger } from '../wirings/trigger/trigger-runner.js'

// ============================================
// Distributed TriggerService for claiming tests
// ============================================

class DistributedTriggerService extends TriggerService {
  registrations: TriggerRegistration[] = []
  instances: Map<
    string,
    {
      triggerName: string
      inputHash: string
      inputData: unknown
      ownerDeploymentId: string
    }
  > = new Map()

  protected async storeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    const exists = this.registrations.some(
      (r) =>
        r.triggerName === registration.triggerName &&
        r.inputHash === registration.inputHash &&
        r.targetType === registration.targetType &&
        r.targetName === registration.targetName
    )
    if (!exists) {
      this.registrations.push(registration)
    }
  }

  protected async removeRegistration(
    registration: TriggerRegistration
  ): Promise<void> {
    this.registrations = this.registrations.filter(
      (r) =>
        !(
          r.triggerName === registration.triggerName &&
          r.inputHash === registration.inputHash &&
          r.targetType === registration.targetType &&
          r.targetName === registration.targetName
        )
    )
  }

  protected async getDistinctTriggerInputs(
    supportedTriggers: string[]
  ): Promise<TriggerInputInstance[]> {
    const seen = new Map<string, TriggerInputInstance>()
    for (const r of this.registrations) {
      if (!supportedTriggers.includes(r.triggerName)) {
        continue
      }
      const key = `${r.triggerName}:${r.inputHash}`
      if (!seen.has(key)) {
        seen.set(key, {
          triggerName: r.triggerName,
          inputHash: r.inputHash,
          inputData: r.inputData,
        })
      }
    }
    return Array.from(seen.values())
  }

  protected async getTargetsForTrigger(
    triggerName: string,
    inputHash: string
  ): Promise<Array<{ targetType: 'rpc' | 'workflow'; targetName: string }>> {
    return this.registrations
      .filter((r) => r.triggerName === triggerName && r.inputHash === inputHash)
      .map((r) => ({ targetType: r.targetType, targetName: r.targetName }))
  }

  protected async tryClaimInstance(
    triggerName: string,
    inputHash: string,
    inputData: unknown
  ): Promise<boolean> {
    const key = `${triggerName}:${inputHash}`
    const existing = this.instances.get(key)
    if (existing) {
      const isOurs =
        existing.ownerDeploymentId === this.deploymentService!.deploymentId
      if (!isOurs) {
        const alive = await this.deploymentService!.isDeploymentAlive(
          existing.ownerDeploymentId
        )
        if (alive) {
          return false
        }
      }
    }
    this.instances.set(key, {
      triggerName,
      inputHash,
      inputData,
      ownerDeploymentId: this.deploymentService!.deploymentId,
    })
    return true
  }

  protected async releaseInstance(
    triggerName: string,
    inputHash: string
  ): Promise<void> {
    const key = `${triggerName}:${inputHash}`
    this.instances.delete(key)
  }
}

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

const createDeploymentService = () => {
  const ds = new InMemoryDeploymentService()
  ds.init()
  ds.start()
  return ds
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
}

/**
 * Wire a mock trigger that captures invocations and can fire data
 */
const wireMockTrigger = (name: string, options?: { fireOnSetup?: unknown }) => {
  setupTriggerMeta(name)

  wireTrigger({
    name,
    func: {
      func: async (_services: any, _input: any, wire: any) => {
        if (options?.fireOnSetup !== undefined) {
          wire.trigger.invoke(options.fireOnSetup)
        }
        return () => {}
      },
    },
  })
}

// ============================================
// Tests
// ============================================

let service: InMemoryTriggerService | DistributedTriggerService
let deploymentService: InMemoryDeploymentService | undefined

beforeEach(() => {
  resetPikkuState()
})

afterEach(async () => {
  if (service) {
    await service.stop()
  }
  if (deploymentService) {
    await deploymentService.stop()
  }
})

describe('generateInputHash', () => {
  test('should produce deterministic hashes', () => {
    const hash1 = generateInputHash({ channel: 'test' })
    const hash2 = generateInputHash({ channel: 'test' })
    assert.equal(hash1, hash2)
  })

  test('should produce different hashes for different inputs', () => {
    const hash1 = generateInputHash({ channel: 'test-a' })
    const hash2 = generateInputHash({ channel: 'test-b' })
    assert.notEqual(hash1, hash2)
  })

  test('should handle null and empty string', () => {
    const hashNull = generateInputHash(null)
    const hashEmpty = generateInputHash('')
    assert.equal(typeof hashNull, 'string')
    assert.equal(typeof hashEmpty, 'string')
    assert.notEqual(hashNull, hashEmpty)
  })

  test('should handle empty object', () => {
    const hash = generateInputHash({})
    assert.equal(typeof hash, 'string')
    assert(hash.length > 0)
  })
})

describe('TriggerService.register', () => {
  test('should register an RPC target', async () => {
    service = new InMemoryTriggerService(createMockServices())

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    assert.equal(service.registrations.length, 1)
    assert.equal(service.registrations[0].triggerName, 'test-trigger')
    assert.equal(service.registrations[0].targetType, 'rpc')
    assert.equal(service.registrations[0].targetName, 'processMessage')
  })

  test('should register a workflow target', async () => {
    service = new InMemoryTriggerService(createMockServices())

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { workflow: 'logWorkflow' },
    })

    assert.equal(service.registrations.length, 1)
    assert.equal(service.registrations[0].targetType, 'workflow')
    assert.equal(service.registrations[0].targetName, 'logWorkflow')
  })

  test('should register multiple targets for the same trigger+input', async () => {
    service = new InMemoryTriggerService(createMockServices())

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { workflow: 'logWorkflow' },
    })

    assert.equal(service.registrations.length, 2)
  })

  test('should be idempotent (duplicate registration is a no-op)', async () => {
    service = new InMemoryTriggerService(createMockServices())

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    assert.equal(service.registrations.length, 1)
  })

  test('should throw when target has neither rpc nor workflow', async () => {
    service = new InMemoryTriggerService(createMockServices())

    await assert.rejects(
      async () => {
        await service.register({
          trigger: 'test-trigger',
          input: {},
          target: {},
        })
      },
      (error: any) => {
        assert(
          error.message.includes('Target must specify either rpc or workflow')
        )
        return true
      }
    )
  })

  test('should compute different input hashes for different inputs', async () => {
    service = new InMemoryTriggerService(createMockServices())

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'channel-a' },
      target: { rpc: 'handleA' },
    })

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'channel-b' },
      target: { rpc: 'handleB' },
    })

    assert.equal(service.registrations.length, 2)
    assert.notEqual(
      service.registrations[0].inputHash,
      service.registrations[1].inputHash
    )
  })
})

describe('TriggerService.unregister', () => {
  test('should remove a registered target', async () => {
    service = new InMemoryTriggerService(createMockServices())

    const reg = await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    assert.equal(service.registrations.length, 1)

    await service.unregister(reg)

    assert.equal(service.registrations.length, 0)
  })

  test('should only remove the specific target, not others', async () => {
    service = new InMemoryTriggerService(createMockServices())

    const reg1 = await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { workflow: 'logWorkflow' },
    })

    await service.unregister(reg1)

    assert.equal(service.registrations.length, 1)
    assert.equal(service.registrations[0].targetType, 'workflow')
  })

  test('should be a no-op when target does not exist', async () => {
    service = new InMemoryTriggerService(createMockServices())

    // Should not throw
    await service.unregister({
      triggerName: 'test-trigger',
      inputHash: 'nonexistent',
      inputData: {},
      targetType: 'rpc',
      targetName: 'nonExistent',
    })

    assert.equal(service.registrations.length, 0)
  })
})

describe('TriggerService.start', () => {
  test('should do nothing when no triggers are wired', async () => {
    const mockLogger = createMockLogger()
    service = new InMemoryTriggerService(createMockServices(mockLogger))

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    await service.start()

    const logs = mockLogger.getLogs()
    assert(logs.some((l) => l.message.includes('No triggers wired')))
  })

  test('should start a trigger subscription for wired triggers', async () => {
    const mockLogger = createMockLogger()
    service = new InMemoryTriggerService(createMockServices(mockLogger))

    wireMockTrigger('test-trigger')

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    await service.start()

    const logs = mockLogger.getLogs()
    assert(logs.some((l) => l.message.includes('Started trigger:')))
  })

  test('should only start triggers this process supports', async () => {
    const mockLogger = createMockLogger()
    service = new InMemoryTriggerService(createMockServices(mockLogger))

    wireMockTrigger('supported-trigger')

    // Register both a supported and unsupported trigger
    await service.register({
      trigger: 'supported-trigger',
      input: { channel: 'a' },
      target: { rpc: 'handleA' },
    })

    await service.register({
      trigger: 'unsupported-trigger',
      input: { channel: 'b' },
      target: { rpc: 'handleB' },
    })

    await service.start()

    // Only the supported trigger should have started
    const logs = mockLogger.getLogs()
    const startedLogs = logs.filter((l) =>
      l.message.includes('Started trigger:')
    )
    assert.equal(startedLogs.length, 1)
    assert(startedLogs[0].message.includes('supported-trigger'))
  })

  test('should start multiple trigger instances with different inputs', async () => {
    const mockLogger = createMockLogger()
    service = new InMemoryTriggerService(createMockServices(mockLogger))

    wireMockTrigger('test-trigger')

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'channel-a' },
      target: { rpc: 'handleA' },
    })

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'channel-b' },
      target: { rpc: 'handleB' },
    })

    await service.start()

    const logs = mockLogger.getLogs()
    const startedLogs = logs.filter((l) =>
      l.message.includes('Started trigger:')
    )
    assert.equal(startedLogs.length, 2)
  })

  test('should not start a trigger that is already active', async () => {
    const mockLogger = createMockLogger()
    service = new InMemoryTriggerService(createMockServices(mockLogger))

    wireMockTrigger('test-trigger')

    await service.register({
      trigger: 'test-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

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
})

describe('TriggerService.stop', () => {
  test('should tear down all active triggers', async () => {
    let tornDown = false

    setupTriggerMeta('stop-trigger')
    wireTrigger({
      name: 'stop-trigger',
      func: {
        func: async () => {
          return () => {
            tornDown = true
          }
        },
      },
    })

    const mockLogger = createMockLogger()
    service = new InMemoryTriggerService(createMockServices(mockLogger))

    await service.register({
      trigger: 'stop-trigger',
      input: { channel: 'my-channel' },
      target: { rpc: 'processMessage' },
    })

    await service.start()
    await service.stop()
    assert.equal(tornDown, true)

    const logs = mockLogger.getLogs()
    assert(logs.some((l) => l.message.includes('Stopped trigger:')))
  })

  test('should release claimed instances on stop', async () => {
    const mockLogger = createMockLogger()
    service = new InMemoryTriggerService(createMockServices(mockLogger))

    wireMockTrigger('release-trigger')

    await service.register({
      trigger: 'release-trigger',
      input: { channel: 'a' },
      target: { rpc: 'handleA' },
    })

    await service.start()
    await service.stop()

    const logs = mockLogger.getLogs()
    assert(logs.some((l) => l.message.includes('Stopped trigger:')))
  })

  test('should be safe to call stop when nothing is started', async () => {
    service = new InMemoryTriggerService(createMockServices())

    // Should not throw
    await service.stop()
  })
})

describe('TriggerService.onTriggerFire', () => {
  test('should invoke RPC targets when trigger fires', async () => {
    let rpcInvoked = false
    let rpcData: any

    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = new InMemoryTriggerService(mockServices)

    // Override the rpcService to capture calls
    ;(service as any).rpcService = {
      rpc: async (name: string, data: any) => {
        rpcInvoked = true
        rpcData = data
      },
      startWorkflow: async () => ({ runId: 'test' }),
    }

    // Wire a trigger that fires immediately on setup
    setupTriggerMeta('fire-trigger')
    wireTrigger({
      name: 'fire-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          // Fire asynchronously so registration can be queried
          setTimeout(() => wire.trigger.invoke({ message: 'hello' }), 10)
          return () => {}
        },
      },
    })

    await service.register({
      trigger: 'fire-trigger',
      input: { channel: 'test' },
      target: { rpc: 'processMessage' },
    })

    await service.start()

    // Wait for the async trigger fire
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(rpcInvoked, true)
    assert.deepEqual(rpcData, { message: 'hello' })
  })

  test('should invoke workflow targets when trigger fires', async () => {
    let workflowStarted = false
    let workflowName: string | undefined
    let workflowData: any

    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = new InMemoryTriggerService(mockServices)
    ;(service as any).rpcService = {
      rpc: async () => {},
      startWorkflow: async (name: string, data: any) => {
        workflowStarted = true
        workflowName = name
        workflowData = data
        return { runId: 'test-run' }
      },
    }

    setupTriggerMeta('workflow-trigger')
    wireTrigger({
      name: 'workflow-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ event: 'new-data' }), 10)
          return () => {}
        },
      },
    })

    await service.register({
      trigger: 'workflow-trigger',
      input: { channel: 'events' },
      target: { workflow: 'logWorkflow' },
    })

    await service.start()

    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(workflowStarted, true)
    assert.equal(workflowName, 'logWorkflow')
    assert.deepEqual(workflowData, { event: 'new-data' })
  })

  test('should invoke all targets when trigger fires', async () => {
    const invoked: string[] = []

    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = new InMemoryTriggerService(mockServices)
    ;(service as any).rpcService = {
      rpc: async (name: string) => {
        invoked.push(`rpc:${name}`)
      },
      startWorkflow: async (name: string) => {
        invoked.push(`workflow:${name}`)
        return { runId: 'test' }
      },
    }

    setupTriggerMeta('multi-target-trigger')
    wireTrigger({
      name: 'multi-target-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ data: 'test' }), 10)
          return () => {}
        },
      },
    })

    await service.register({
      trigger: 'multi-target-trigger',
      input: { channel: 'test' },
      target: { rpc: 'handleA' },
    })

    await service.register({
      trigger: 'multi-target-trigger',
      input: { channel: 'test' },
      target: { rpc: 'handleB' },
    })

    await service.register({
      trigger: 'multi-target-trigger',
      input: { channel: 'test' },
      target: { workflow: 'logWorkflow' },
    })

    await service.start()

    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(invoked.length, 3)
    assert(invoked.includes('rpc:handleA'))
    assert(invoked.includes('rpc:handleB'))
    assert(invoked.includes('workflow:logWorkflow'))
  })

  test('should pass startNode from trigger wire when invoking graph workflow', async () => {
    let receivedOptions: any

    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = new InMemoryTriggerService(mockServices)
    ;(service as any).rpcService = {
      rpc: async () => {},
      startWorkflow: async (name: string, data: any, options?: any) => {
        receivedOptions = options
        return { runId: 'test-run' }
      },
    }

    // Set up workflow graph registration with a trigger wire
    const wires = {
      trigger: [{ name: 'graph-trigger', startNode: 'entryNode' }],
    }
    const graphRegistrations = pikkuState(
      null,
      'workflows',
      'graphRegistrations'
    )
    graphRegistrations.set('myGraphWorkflow', {
      name: 'myGraphWorkflow',
      wires,
      graph: {},
    })

    const meta = pikkuState(null, 'workflows', 'meta')
    meta['myGraphWorkflow'] = {
      name: 'myGraphWorkflow',
      pikkuFuncName: 'myGraphWorkflow',
      source: 'graph',
    }

    setupTriggerMeta('graph-trigger')
    wireTrigger({
      name: 'graph-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ event: 'go' }), 10)
          return () => {}
        },
      },
    })

    await service.register({
      trigger: 'graph-trigger',
      input: { channel: 'test' },
      target: { workflow: 'myGraphWorkflow' },
    })

    await service.start()
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.deepEqual(receivedOptions, { startNode: 'entryNode' })
  })

  test('should pass undefined startNode when no trigger wire is defined', async () => {
    let receivedOptions: any

    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = new InMemoryTriggerService(mockServices)
    ;(service as any).rpcService = {
      rpc: async () => {},
      startWorkflow: async (name: string, data: any, options?: any) => {
        receivedOptions = options
        return { runId: 'test-run' }
      },
    }

    setupTriggerMeta('plain-trigger')
    wireTrigger({
      name: 'plain-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ event: 'go' }), 10)
          return () => {}
        },
      },
    })

    await service.register({
      trigger: 'plain-trigger',
      input: { channel: 'test' },
      target: { workflow: 'plainWorkflow' },
    })

    await service.start()
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.deepEqual(receivedOptions, { startNode: undefined })
  })

  test('should log errors when target invocation fails', async () => {
    const mockLogger = createMockLogger()
    const mockServices = {
      logger: mockLogger,
    } as any

    service = new InMemoryTriggerService(mockServices)
    ;(service as any).rpcService = {
      rpc: async () => {
        throw new Error('RPC failed')
      },
      startWorkflow: async () => ({ runId: 'test' }),
    }

    setupTriggerMeta('error-trigger')
    wireTrigger({
      name: 'error-trigger',
      func: {
        func: async (_services: any, _input: any, wire: any) => {
          setTimeout(() => wire.trigger.invoke({ data: 'test' }), 10)
          return () => {}
        },
      },
    })

    await service.register({
      trigger: 'error-trigger',
      input: { channel: 'test' },
      target: { rpc: 'failingRpc' },
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

describe('TriggerService claiming', () => {
  test('should not claim an instance already owned by another alive deployment', async () => {
    const mockLogger = createMockLogger()
    deploymentService = createDeploymentService()
    const distService = new DistributedTriggerService(
      createMockServices(mockLogger),
      deploymentService
    )
    service = distService

    wireMockTrigger('claimed-trigger')

    await distService.register({
      trigger: 'claimed-trigger',
      input: { channel: 'test' },
      target: { rpc: 'handle' },
    })

    // Simulate another deployment claiming the instance
    const otherDeploymentId = 'other-deployment-123'
    ;(deploymentService as any).deployments.set(otherDeploymentId, {
      heartbeatAt: Date.now(),
    })

    const inputHash = generateInputHash({ channel: 'test' })
    distService.instances.set(`claimed-trigger:${inputHash}`, {
      triggerName: 'claimed-trigger',
      inputHash,
      inputData: { channel: 'test' },
      ownerDeploymentId: otherDeploymentId,
    })

    await distService.start()

    // The instance should still be owned by the other deployment
    const instance = distService.instances.get(`claimed-trigger:${inputHash}`)
    assert.equal(instance?.ownerDeploymentId, otherDeploymentId)
  })
})
