import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  wireQueueWorker,
  getQueueWorkers,
  removeQueueWorker,
  runQueueJob,
  QueueJobFailedError,
  QueueJobDiscardedError,
} from './queue-runner.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { CoreQueueWorker, QueueJob } from './queue.types.js'

beforeEach(() => {
  resetPikkuState()
})

const createMockLogger = () => {
  const logs: Array<{ level: string; message: string | any; error?: any }> = []
  return {
    info: (msg: string | any) => logs.push({ level: 'info', message: msg }),
    warn: (msg: string | any) => logs.push({ level: 'warn', message: msg }),
    error: (msg: string | any, error?: any) =>
      logs.push({ level: 'error', message: msg, error }),
    debug: (msg: string | any) => logs.push({ level: 'debug', message: msg }),
    getLogs: () => logs,
  }
}

const createMockJob = (
  queueName: string,
  id: string,
  data: any = {}
): QueueJob => ({
  id,
  queueName,
  status: async () => 'active' as const,
  data,
})

const addTestQueueFunction = (pikkuFuncName: string) => {
  pikkuState('function', 'meta')[pikkuFuncName] = {
    pikkuFuncName,
    inputSchemaName: null,
    outputSchemaName: null,
    middleware: undefined,
    permissions: undefined,
  }
}

describe('wireQueueWorker', () => {
  test('should successfully wire a queue worker', () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'test-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          return { processed: true }
        },
        auth: false,
      },
    }

    // Set up metadata first
    pikkuState('queue', 'meta')['test-queue'] = {
      pikkuFuncName: 'queue_test-queue',
      queueName: 'test-queue',
    }
    addTestQueueFunction('queue_test-queue')
    wireQueueWorker(mockWorker)

    const registrations = pikkuState('queue', 'registrations')
    assert.equal(registrations.has('test-queue'), true)
    assert.equal(registrations.get('test-queue'), mockWorker)
  })

  test('should throw error when processor metadata not found', () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'missing-meta-queue',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    assert.throws(
      () => wireQueueWorker(mockWorker),
      (error: any) => {
        assert(error.message.includes('Queue processor metadata not found'))
        assert(error.message.includes('missing-meta-queue'))
        return true
      }
    )
  })

  test('should wire worker with middleware and tags', () => {
    const middleware = async (services: any, wire: any, next: any) => {
      await next()
    }

    const mockWorker: CoreQueueWorker = {
      queueName: 'worker-with-middleware',
      func: {
        func: async () => {},
        auth: false,
        middleware: [middleware],
        tags: ['admin'],
      },
      middleware: [middleware],
      tags: ['queue'],
    }

    pikkuState('queue', 'meta')['worker-with-middleware'] = {
      pikkuFuncName: 'queue_worker-with-middleware',
      queueName: 'worker-with-middleware',
    }
    addTestQueueFunction('queue_worker-with-middleware')
    wireQueueWorker(mockWorker)

    const registrations = pikkuState('queue', 'registrations')
    const worker = registrations.get('worker-with-middleware')
    assert.equal(worker?.middleware?.length, 1)
    assert.deepEqual(worker?.tags, ['queue'])
  })
})

describe('getQueueWorkers', () => {
  test('should return the registrations map', () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'test-queue',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['test-queue'] = {
      pikkuFuncName: 'queue_test-queue',
      queueName: 'test-queue',
    }
    addTestQueueFunction('queue_test-queue')
    wireQueueWorker(mockWorker)

    const workers = getQueueWorkers()
    assert.equal(workers instanceof Map, true)
    assert.equal(workers.has('test-queue'), true)
  })

  test('should return empty map when no workers registered', () => {
    const workers = getQueueWorkers()
    assert.equal(workers instanceof Map, true)
    assert.equal(workers.size, 0)
  })
})

describe('removeQueueWorker', () => {
  test('should successfully remove a queue worker', async () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'removable-queue',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['removable-queue'] = {
      pikkuFuncName: 'queue_removable-queue',
      queueName: 'removable-queue',
    }
    addTestQueueFunction('queue_removable-queue')
    wireQueueWorker(mockWorker)

    const workersBefore = getQueueWorkers()
    assert.equal(workersBefore.has('removable-queue'), true)

    await removeQueueWorker('removable-queue')

    const workersAfter = getQueueWorkers()
    assert.equal(workersAfter.has('removable-queue'), false)
  })

  test('should throw QueueWorkerNotFoundError when worker not found', async () => {
    await assert.rejects(
      async () => {
        await removeQueueWorker('non-existent-queue')
      },
      (error: any) => {
        assert(error.message.includes('Queue processor not found'))
        assert(error.message.includes('non-existent-queue'))
        return true
      }
    )
  })
})

describe('runQueueJob', () => {
  test('should successfully process a job', async () => {
    let jobProcessed = false
    let receivedData: any

    const mockWorker: CoreQueueWorker = {
      queueName: 'simple-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          jobProcessed = true
          receivedData = data
          return { success: true }
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['simple-queue'] = {
      pikkuFuncName: 'queue_simple-queue',
      queueName: 'simple-queue',
    }
    addTestQueueFunction('queue_simple-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('simple-queue', 'job-123', {
      message: 'test data',
    })

    const result = await runQueueJob({
      singletonServices: { logger: mockLogger } as any,
      job,
    })

    assert.equal(jobProcessed, true)
    assert.deepEqual(receivedData, { message: 'test data' })
    assert.deepEqual(result, { success: true })

    const logs = mockLogger.getLogs()
    const infoLogs = logs.filter((l) => l.level === 'info')
    assert(infoLogs.length > 0)
    assert(infoLogs[0].message.includes('Processing job job-123'))
  })

  test('should handle job.fail() by throwing QueueJobFailedError', async () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'fail-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.fail('Processing failed')
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['fail-queue'] = {
      pikkuFuncName: 'queue_fail-queue',
      queueName: 'fail-queue',
    }
    addTestQueueFunction('queue_fail-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('fail-queue', 'job-fail-123')

    await assert.rejects(
      async () => {
        await runQueueJob({
          singletonServices: { logger: mockLogger } as any,
          job,
        })
      },
      (error: any) => {
        assert(error instanceof QueueJobFailedError)
        assert.equal(error.name, 'QueueJobFailedError')
        assert(error.message.includes('Queue job job-fail-123 failed'))
        assert(error.message.includes('Processing failed'))
        return true
      }
    )
  })

  test('should handle job.fail() without reason', async () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'fail-no-reason-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.fail()
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['fail-no-reason-queue'] = {
      pikkuFuncName: 'queue_fail-no-reason-queue',
      queueName: 'fail-no-reason-queue',
    }
    addTestQueueFunction('queue_fail-no-reason-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('fail-no-reason-queue', 'job-456')

    await assert.rejects(
      async () => {
        await runQueueJob({
          singletonServices: { logger: mockLogger } as any,
          job,
        })
      },
      (error: any) => {
        assert(error instanceof QueueJobFailedError)
        assert(error.message.includes('Queue job job-456 failed'))
        return true
      }
    )
  })

  test('should handle job.discard() by throwing QueueJobDiscardedError', async () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'discard-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.discard('Invalid data')
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['discard-queue'] = {
      pikkuFuncName: 'queue_discard-queue',
      queueName: 'discard-queue',
    }
    addTestQueueFunction('queue_discard-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('discard-queue', 'job-discard-789')

    await assert.rejects(
      async () => {
        await runQueueJob({
          singletonServices: { logger: mockLogger } as any,
          job,
        })
      },
      (error: any) => {
        assert(error instanceof QueueJobDiscardedError)
        assert.equal(error.name, 'QueueJobDiscardedError')
        assert(error.message.includes('Queue job job-discard-789 discarded'))
        assert(error.message.includes('Invalid data'))
        return true
      }
    )
  })

  test('should handle job.updateProgress()', async () => {
    const progressUpdates: Array<number | string | object> = []

    const mockWorker: CoreQueueWorker = {
      queueName: 'progress-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.updateProgress(25)
          await wire.queue.updateProgress('halfway')
          await wire.queue.updateProgress({ stage: 'processing' })
          return 'done'
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['progress-queue'] = {
      pikkuFuncName: 'queue_progress-queue',
      queueName: 'progress-queue',
    }
    addTestQueueFunction('queue_progress-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('progress-queue', 'job-progress-999')

    await runQueueJob({
      singletonServices: { logger: mockLogger } as any,
      job,
      updateProgress: async (progress) => {
        progressUpdates.push(progress)
      },
    })

    assert.deepEqual(progressUpdates, [25, 'halfway', { stage: 'processing' }])
  })

  test('should use default updateProgress when not provided', async () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'default-progress-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.updateProgress(50)
          return 'ok'
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['default-progress-queue'] = {
      pikkuFuncName: 'queue_default-progress-queue',
      queueName: 'default-progress-queue',
    }
    addTestQueueFunction('queue_default-progress-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('default-progress-queue', 'job-111')

    await runQueueJob({
      singletonServices: { logger: mockLogger } as any,
      job,
    })

    const logs = mockLogger.getLogs()
    const progressLog = logs.find((l) => l.message.includes('progress: 50'))
    assert(progressLog !== undefined)
  })

  test('should provide correct wire object to job', async () => {
    let capturedWire: any

    const mockWorker: CoreQueueWorker = {
      queueName: 'wire-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          capturedWire = wire
          return 'ok'
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['wire-queue'] = {
      pikkuFuncName: 'queue_wire-queue',
      queueName: 'wire-queue',
    }
    addTestQueueFunction('queue_wire-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('wire-queue', 'job-int-123')

    await runQueueJob({
      singletonServices: { logger: mockLogger } as any,
      job,
    })

    assert.equal(capturedWire.queue.queueName, 'wire-queue')
    assert.equal(capturedWire.queue.jobId, 'job-int-123')
    assert.equal(typeof capturedWire.queue.updateProgress, 'function')
    assert.equal(typeof capturedWire.queue.fail, 'function')
    assert.equal(typeof capturedWire.queue.discard, 'function')
  })

  test('should throw error when processor metadata not found', async () => {
    const mockLogger = createMockLogger()
    const job = createMockJob('missing-meta-queue', 'job-222')

    await assert.rejects(
      async () => {
        await runQueueJob({
          singletonServices: { logger: mockLogger } as any,
          job,
        })
      },
      (error: any) => {
        assert(error.message.includes('Processor metadata not found'))
        assert(error.message.includes('missing-meta-queue'))
        return true
      }
    )
  })

  test('should throw error when queue worker registration not found', async () => {
    // Add metadata but not registration
    pikkuState('queue', 'meta')['no-registration-queue'] = {
      pikkuFuncName: 'queue_no-registration-queue',
      queueName: 'no-registration-queue',
    }

    const mockLogger = createMockLogger()
    const job = createMockJob('no-registration-queue', 'job-333')

    await assert.rejects(
      async () => {
        await runQueueJob({
          singletonServices: { logger: mockLogger } as any,
          job,
        })
      },
      (error: any) => {
        assert(error.message.includes('Queue worker registration not found'))
        assert(error.message.includes('no-registration-queue'))
        return true
      }
    )
  })

  test('should call createWireServices when provided', async () => {
    let createWireServicesCalled = false
    const mockWireService = { custom: 'service' }

    const mockWorker: CoreQueueWorker = {
      queueName: 'session-services-queue',
      func: {
        func: async () => 'ok',
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['session-services-queue'] = {
      pikkuFuncName: 'queue_session-services-queue',
      queueName: 'session-services-queue',
    }
    addTestQueueFunction('queue_session-services-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('session-services-queue', 'job-444')

    await runQueueJob({
      singletonServices: { logger: mockLogger } as any,
      job,
      createWireServices: async () => {
        createWireServicesCalled = true
        return mockWireService as any
      },
    })

    assert.equal(createWireServicesCalled, true)
  })

  test('should log errors when job processing fails', async () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'error-queue',
      func: {
        func: async () => {
          throw new Error('Processing error')
        },
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['error-queue'] = {
      pikkuFuncName: 'queue_error-queue',
      queueName: 'error-queue',
    }
    addTestQueueFunction('queue_error-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('error-queue', 'job-555')

    await assert.rejects(
      async () => {
        await runQueueJob({
          singletonServices: { logger: mockLogger } as any,
          job,
        })
      },
      (error: any) => {
        assert.equal(error.message, 'Processing error')
        return true
      }
    )

    const logs = mockLogger.getLogs()
    const errorLogs = logs.filter((l) => l.level === 'error')
    assert(errorLogs.length >= 1)
    assert(errorLogs[0].message.includes('Error processing job job-555'))
  })

  test('should execute job with middleware', async () => {
    const executionOrder: string[] = []

    const middleware = async (services: any, wire: any, next: any) => {
      executionOrder.push('middleware')
      await next()
    }

    const mockWorker: CoreQueueWorker = {
      queueName: 'middleware-queue',
      func: {
        func: async () => {
          executionOrder.push('job')
          return 'ok'
        },
        auth: false,
      },
      middleware: [middleware],
    }

    pikkuState('queue', 'meta')['middleware-queue'] = {
      pikkuFuncName: 'queue_middleware-queue',
      queueName: 'middleware-queue',
    }
    addTestQueueFunction('queue_middleware-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('middleware-queue', 'job-666')

    await runQueueJob({
      singletonServices: { logger: mockLogger } as any,
      job,
    })

    assert.deepEqual(executionOrder, ['middleware', 'job'])
  })

  test('should log debug message on successful job completion', async () => {
    const mockWorker: CoreQueueWorker = {
      queueName: 'debug-queue',
      func: {
        func: async () => 'success',
        auth: false,
      },
    }

    pikkuState('queue', 'meta')['debug-queue'] = {
      pikkuFuncName: 'queue_debug-queue',
      queueName: 'debug-queue',
    }
    addTestQueueFunction('queue_debug-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    const job = createMockJob('debug-queue', 'job-777')

    await runQueueJob({
      singletonServices: { logger: mockLogger } as any,
      job,
    })

    const logs = mockLogger.getLogs()
    const debugLogs = logs.filter((l) => l.level === 'debug')
    assert.equal(debugLogs.length, 1)
    assert(debugLogs[0].message.includes('Successfully processed job job-777'))
  })
})
