import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  wireScheduler,
  runScheduledTask,
  getScheduledTasks,
} from './scheduler-runner.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { CoreScheduledTask } from './scheduler.types.js'
import { CoreUserSession } from '../../types/core.types.js'

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

describe('wireScheduler', () => {
  test('should successfully wire a scheduled task', () => {
    const mockTask: CoreScheduledTask = {
      name: 'test-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    // Set up metadata first
    pikkuState('', 'scheduler', 'meta')['test-task'] = {
      pikkuFuncName: 'scheduler_test-task',
      name: 'test-task',
      schedule: '0 0 * * *',
    }

    wireScheduler(mockTask)

    const tasks = pikkuState('', 'scheduler', 'tasks')
    assert.equal(tasks.has('test-task'), true)
    assert.equal(tasks.get('test-task'), mockTask)
  })

  test('should throw error when task metadata not found', () => {
    const mockTask: CoreScheduledTask = {
      name: 'missing-meta-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    assert.throws(
      () => wireScheduler(mockTask),
      (error: any) => {
        assert.equal(error.message, 'Task metadata not found')
        return true
      }
    )
  })

  test('should throw error when scheduled task already exists', () => {
    const mockTask: CoreScheduledTask = {
      name: 'duplicate-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    // Set up metadata
    pikkuState('', 'scheduler', 'meta')['duplicate-task'] = {
      pikkuFuncName: 'scheduler_duplicate-task',
      name: 'duplicate-task',
      schedule: '0 0 * * *',
    }

    // Wire first time
    wireScheduler(mockTask)

    // Try to wire again
    assert.throws(
      () => wireScheduler(mockTask),
      (error: any) => {
        assert.equal(
          error.message,
          'Scheduled task already exists: duplicate-task'
        )
        return true
      }
    )
  })

  test('should wire task with middleware and tags', () => {
    const middleware = async (services: any, wire: any, next: any) => {
      await next()
    }

    const mockTask: CoreScheduledTask = {
      name: 'task-with-middleware',
      schedule: '0 0 * * *',
      func: {
        func: async () => {},
        auth: false,
        middleware: [middleware],
        tags: ['admin'],
      },
      middleware: [middleware],
      tags: ['scheduled'],
    }

    pikkuState('', 'scheduler', 'meta')['task-with-middleware'] = {
      pikkuFuncName: 'scheduler_task-with-middleware',
      name: 'task-with-middleware',
      schedule: '0 0 * * *',
    }

    wireScheduler(mockTask)

    const tasks = pikkuState('', 'scheduler', 'tasks')
    const task = tasks.get('task-with-middleware')
    assert.equal(task?.middleware?.length, 1)
    assert.deepEqual(task?.tags, ['scheduled'])
  })
})

describe('runScheduledTask', () => {
  test('should successfully run a scheduled task', async () => {
    let taskExecuted = false

    const mockTask: CoreScheduledTask = {
      name: 'simple-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => {
          taskExecuted = true
        },
        auth: false,
      },
    }

    // Set up metadata and task
    pikkuState('', 'scheduler', 'meta')['simple-task'] = {
      pikkuFuncName: 'scheduler_simple-task',
      name: 'simple-task',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_simple-task'] = {
      pikkuFuncName: 'scheduler_simple-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()
    await runScheduledTask({
      name: 'simple-task',
      singletonServices: { logger: mockLogger } as any,
    })

    assert.equal(taskExecuted, true)

    const logs = mockLogger.getLogs()
    assert.equal(logs.length, 1)
    assert.equal(logs[0].level, 'info')
    assert(logs[0].message.includes('Running schedule task: simple-task'))
  })

  test('should run task with session', async () => {
    let receivedSession: CoreUserSession | undefined

    const mockTask: CoreScheduledTask = {
      name: 'task-with-session',
      schedule: '0 0 * * *',
      func: {
        func: async (services: any, data: any, wire: any) => {
          receivedSession = await wire.session.get()
        },
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['task-with-session'] = {
      pikkuFuncName: 'scheduler_task-with-session',
      name: 'task-with-session',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_task-with-session'] = {
      pikkuFuncName: 'scheduler_task-with-session',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()
    const session: CoreUserSession = { userId: 'user123' }

    await runScheduledTask({
      name: 'task-with-session',
      session,
      singletonServices: { logger: mockLogger } as any,
    })

    assert.deepEqual(receivedSession, session)
  })

  test('should throw ScheduledTaskNotFoundError when task not found', async () => {
    const mockLogger = createMockLogger()

    await assert.rejects(
      async () => {
        await runScheduledTask({
          name: 'non-existent-task',
          singletonServices: { logger: mockLogger } as any,
        })
      },
      (error: any) => {
        assert(error.message.includes('Scheduled task not found'))
        return true
      }
    )
  })

  test('should throw ScheduledTaskNotFoundError when meta not found', async () => {
    const mockTask: CoreScheduledTask = {
      name: 'task-without-meta',
      schedule: '0 0 * * *',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    // Add task but not metadata
    pikkuState('', 'scheduler', 'tasks').set('task-without-meta', mockTask)

    const mockLogger = createMockLogger()

    await assert.rejects(
      async () => {
        await runScheduledTask({
          name: 'task-without-meta',
          singletonServices: { logger: mockLogger } as any,
        })
      },
      (error: any) => {
        assert(error.message.includes('Scheduled task meta not found'))
        return true
      }
    )
  })

  test('should handle task.skip() by throwing ScheduledTaskSkippedError', async () => {
    const mockTask: CoreScheduledTask = {
      name: 'skipped-task',
      schedule: '0 0 * * *',
      func: {
        func: async (services: any, data: any, wire: any) => {
          wire.scheduledTask.skip('Not ready yet')
        },
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['skipped-task'] = {
      pikkuFuncName: 'scheduler_skipped-task',
      name: 'skipped-task',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_skipped-task'] = {
      pikkuFuncName: 'scheduler_skipped-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await assert.rejects(
      async () => {
        await runScheduledTask({
          name: 'skipped-task',
          singletonServices: { logger: mockLogger } as any,
        })
      },
      (error: any) => {
        assert(
          error.message.includes("Scheduled task 'skipped-task' was skipped")
        )
        assert(error.message.includes('Not ready yet'))
        return true
      }
    )
  })

  test('should handle task.skip() without reason', async () => {
    const mockTask: CoreScheduledTask = {
      name: 'skipped-task-no-reason',
      schedule: '0 0 * * *',
      func: {
        func: async (services: any, data: any, wire: any) => {
          wire.scheduledTask.skip()
        },
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['skipped-task-no-reason'] = {
      pikkuFuncName: 'scheduler_skipped-task-no-reason',
      name: 'skipped-task-no-reason',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_skipped-task-no-reason'] = {
      pikkuFuncName: 'scheduler_skipped-task-no-reason',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await assert.rejects(
      async () => {
        await runScheduledTask({
          name: 'skipped-task-no-reason',
          singletonServices: { logger: mockLogger } as any,
        })
      },
      (error: any) => {
        assert(
          error.message.includes(
            "Scheduled task 'skipped-task-no-reason' was skipped"
          )
        )
        return true
      }
    )
  })

  test('should provide correct wire object to task', async () => {
    let capturedWire: any

    const mockTask: CoreScheduledTask = {
      name: 'wire-task',
      schedule: '*/5 * * * *',
      func: {
        func: async (services: any, data: any, wire: any) => {
          capturedWire = wire
        },
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['wire-task'] = {
      pikkuFuncName: 'scheduler_wire-task',
      name: 'wire-task',
      schedule: '*/5 * * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_wire-task'] = {
      pikkuFuncName: 'scheduler_wire-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await runScheduledTask({
      name: 'wire-task',
      singletonServices: { logger: mockLogger } as any,
    })

    assert.equal(capturedWire.scheduledTask.name, 'wire-task')
    assert.equal(capturedWire.scheduledTask.schedule, '*/5 * * * *')
    assert(capturedWire.scheduledTask.executionTime instanceof Date)
    assert.equal(typeof capturedWire.scheduledTask.skip, 'function')
  })

  test('should call createWireServices when provided', async () => {
    let createWireServicesCalled = false
    const mockWireService = { custom: 'service' }

    const mockTask: CoreScheduledTask = {
      name: 'session-services-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => undefined,
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['session-services-task'] = {
      pikkuFuncName: 'scheduler_session-services-task',
      name: 'session-services-task',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_session-services-task'] = {
      pikkuFuncName: 'scheduler_session-services-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await runScheduledTask({
      name: 'session-services-task',
      singletonServices: { logger: mockLogger } as any,
      createWireServices: async () => {
        createWireServicesCalled = true
        return mockWireService as any
      },
    })

    assert.equal(createWireServicesCalled, true)
  })

  test('should clean up wire services in finally block', async () => {
    let closeCalled = false
    const mockWireService = {
      custom: {
        close: async () => {
          closeCalled = true
        },
      },
    }

    const mockTask: CoreScheduledTask = {
      name: 'cleanup-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => undefined,
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['cleanup-task'] = {
      pikkuFuncName: 'scheduler_cleanup-task',
      name: 'cleanup-task',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_cleanup-task'] = {
      pikkuFuncName: 'scheduler_cleanup-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await runScheduledTask({
      name: 'cleanup-task',
      singletonServices: { logger: mockLogger } as any,
      createWireServices: async () => mockWireService as any,
    })

    assert.equal(closeCalled, true)
  })

  test('should clean up wire services even when task throws error', async () => {
    let closeCalled = false
    const mockWireService = {
      custom: {
        close: async () => {
          closeCalled = true
        },
      },
    }

    const mockTask: CoreScheduledTask = {
      name: 'error-cleanup-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => {
          throw new Error('Task failed')
        },
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['error-cleanup-task'] = {
      pikkuFuncName: 'scheduler_error-cleanup-task',
      name: 'error-cleanup-task',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_error-cleanup-task'] = {
      pikkuFuncName: 'scheduler_error-cleanup-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await assert.rejects(async () => {
      await runScheduledTask({
        name: 'error-cleanup-task',
        singletonServices: { logger: mockLogger } as any,
        createWireServices: async () => mockWireService as any,
      })
    })

    assert.equal(closeCalled, true)
  })

  test('should re-throw errors from task', async () => {
    const mockTask: CoreScheduledTask = {
      name: 'error-task',
      schedule: '0 0 * * *',
      func: {
        func: async (services: any, data: any, wire: any) => {
          wire.scheduledTask.skip('Test skip')
        },
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['error-task'] = {
      pikkuFuncName: 'scheduler_error-task',
      name: 'error-task',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_error-task'] = {
      pikkuFuncName: 'scheduler_error-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await assert.rejects(async () => {
      await runScheduledTask({
        name: 'error-task',
        singletonServices: { logger: mockLogger } as any,
      })
    })

    // Error should be re-thrown
    const logs = mockLogger.getLogs()
    const infoLogs = logs.filter((l) => l.level === 'info')
    assert(infoLogs.length > 0) // Should have at least started logging
  })

  test('should execute task with middleware', async () => {
    const executionOrder: string[] = []

    const middleware = async (services: any, wire: any, next: any) => {
      executionOrder.push('middleware')
      await next()
    }

    const mockTask: CoreScheduledTask = {
      name: 'middleware-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => {
          executionOrder.push('task')
        },
        auth: false,
      },
      middleware: [middleware],
    }

    pikkuState('', 'scheduler', 'meta')['middleware-task'] = {
      pikkuFuncName: 'scheduler_middleware-task',
      name: 'middleware-task',
      schedule: '0 0 * * *',
    }
    pikkuState('', 'function', 'meta')['scheduler_middleware-task'] = {
      pikkuFuncName: 'scheduler_middleware-task',
      inputSchemaName: null,
      outputSchemaName: null,
    }
    wireScheduler(mockTask)

    const mockLogger = createMockLogger()

    await runScheduledTask({
      name: 'middleware-task',
      singletonServices: { logger: mockLogger } as any,
    })

    assert.deepEqual(executionOrder, ['middleware', 'task'])
  })
})

describe('getScheduledTasks', () => {
  test('should return the tasks map', () => {
    const mockTask: CoreScheduledTask = {
      name: 'test-task',
      schedule: '0 0 * * *',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    pikkuState('', 'scheduler', 'meta')['test-task'] = {
      pikkuFuncName: 'scheduler_test-task',
      name: 'test-task',
      schedule: '0 0 * * *',
    }
    wireScheduler(mockTask)

    const tasks = getScheduledTasks()
    assert.equal(tasks instanceof Map, true)
    assert.equal(tasks.has('test-task'), true)
  })

  test('should return empty map when no tasks registered', () => {
    const tasks = getScheduledTasks()
    assert.equal(tasks instanceof Map, true)
    assert.equal(tasks.size, 0)
  })
})
