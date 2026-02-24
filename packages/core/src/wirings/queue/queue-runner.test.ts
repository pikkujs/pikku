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

const addTestQueueFunction = (pikkuFuncId: string) => {
  pikkuState(null, 'function', 'meta')[pikkuFuncId] = {
    pikkuFuncId,
    inputSchemaName: null,
    outputSchemaName: null,
    middleware: undefined,
    permissions: undefined,
  }
}

describe('wireQueueWorker', () => {
  test('should successfully wire a queue worker', () => {
    const mockWorker: CoreQueueWorker = {
      name: 'test-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          return { processed: true }
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['test-queue'] = {
      pikkuFuncId: 'queue_test-queue',
      name: 'test-queue',
    }
    addTestQueueFunction('queue_test-queue')
    wireQueueWorker(mockWorker)

    const registrations = pikkuState(null, 'queue', 'registrations')
    assert.equal(registrations.has('test-queue'), true)
    assert.equal(registrations.get('test-queue'), mockWorker)
  })

  test('should throw error when processor metadata not found', () => {
    const mockWorker: CoreQueueWorker = {
      name: 'missing-meta-queue',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    assert.throws(
      () => wireQueueWorker(mockWorker),
      (error: any) => {
        assert(
          error.message.includes('Missing generated metadata for queue worker')
        )
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
      name: 'worker-with-middleware',
      func: {
        func: async () => {},
        auth: false,
        middleware: [middleware],
        tags: ['admin'],
      },
      middleware: [middleware],
      tags: ['queue'],
    }

    pikkuState(null, 'queue', 'meta')['worker-with-middleware'] = {
      pikkuFuncId: 'queue_worker-with-middleware',
      name: 'worker-with-middleware',
    }
    addTestQueueFunction('queue_worker-with-middleware')
    wireQueueWorker(mockWorker)

    const registrations = pikkuState(null, 'queue', 'registrations')
    const worker = registrations.get('worker-with-middleware')
    assert.equal(worker?.middleware?.length, 1)
    assert.deepEqual(worker?.tags, ['queue'])
  })
})

describe('getQueueWorkers', () => {
  test('should return the registrations map', () => {
    const mockWorker: CoreQueueWorker = {
      name: 'test-queue',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['test-queue'] = {
      pikkuFuncId: 'queue_test-queue',
      name: 'test-queue',
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
      name: 'removable-queue',
      func: {
        func: async () => {},
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['removable-queue'] = {
      pikkuFuncId: 'queue_removable-queue',
      name: 'removable-queue',
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
      name: 'simple-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          jobProcessed = true
          receivedData = data
          return { success: true }
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['simple-queue'] = {
      pikkuFuncId: 'queue_simple-queue',
      name: 'simple-queue',
    }
    addTestQueueFunction('queue_simple-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('simple-queue', 'job-123', {
      message: 'test data',
    })

    const result = await runQueueJob({
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
      name: 'fail-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.fail('Processing failed')
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['fail-queue'] = {
      pikkuFuncId: 'queue_fail-queue',
      name: 'fail-queue',
    }
    addTestQueueFunction('queue_fail-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('fail-queue', 'job-fail-123')

    await assert.rejects(
      async () => {
        await runQueueJob({
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
      name: 'fail-no-reason-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.fail()
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['fail-no-reason-queue'] = {
      pikkuFuncId: 'queue_fail-no-reason-queue',
      name: 'fail-no-reason-queue',
    }
    addTestQueueFunction('queue_fail-no-reason-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('fail-no-reason-queue', 'job-456')

    await assert.rejects(
      async () => {
        await runQueueJob({
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
      name: 'discard-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.discard('Invalid data')
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['discard-queue'] = {
      pikkuFuncId: 'queue_discard-queue',
      name: 'discard-queue',
    }
    addTestQueueFunction('queue_discard-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('discard-queue', 'job-discard-789')

    await assert.rejects(
      async () => {
        await runQueueJob({
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
      name: 'progress-queue',
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

    pikkuState(null, 'queue', 'meta')['progress-queue'] = {
      pikkuFuncId: 'queue_progress-queue',
      name: 'progress-queue',
    }
    addTestQueueFunction('queue_progress-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('progress-queue', 'job-progress-999')

    await runQueueJob({
      job,
      updateProgress: async (progress) => {
        progressUpdates.push(progress)
      },
    })

    assert.deepEqual(progressUpdates, [25, 'halfway', { stage: 'processing' }])
  })

  test('should use default updateProgress when not provided', async () => {
    const mockWorker: CoreQueueWorker = {
      name: 'default-progress-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          await wire.queue.updateProgress(50)
          return 'ok'
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['default-progress-queue'] = {
      pikkuFuncId: 'queue_default-progress-queue',
      name: 'default-progress-queue',
    }
    addTestQueueFunction('queue_default-progress-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('default-progress-queue', 'job-111')

    await runQueueJob({
      job,
    })

    const logs = mockLogger.getLogs()
    const progressLog = logs.find((l) => l.message.includes('progress: 50'))
    assert(progressLog !== undefined)
  })

  test('should provide correct wire object to job', async () => {
    let capturedWire: any

    const mockWorker: CoreQueueWorker = {
      name: 'wire-queue',
      func: {
        func: async (services: any, data: any, wire: any) => {
          capturedWire = wire
          return 'ok'
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['wire-queue'] = {
      pikkuFuncId: 'queue_wire-queue',
      name: 'wire-queue',
    }
    addTestQueueFunction('queue_wire-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('wire-queue', 'job-int-123')

    await runQueueJob({
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
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('missing-meta-queue', 'job-222')

    await assert.rejects(
      async () => {
        await runQueueJob({
          job,
        })
      },
      (error: any) => {
        assert(
          error.message.includes('Missing generated metadata for queue worker')
        )
        assert(error.message.includes('missing-meta-queue'))
        return true
      }
    )
  })

  test('should throw error when queue worker registration not found', async () => {
    pikkuState(null, 'queue', 'meta')['no-registration-queue'] = {
      pikkuFuncId: 'queue_no-registration-queue',
      name: 'no-registration-queue',
    }

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('no-registration-queue', 'job-333')

    await assert.rejects(
      async () => {
        await runQueueJob({
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
      name: 'session-services-queue',
      func: {
        func: async () => 'ok',
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['session-services-queue'] = {
      pikkuFuncId: 'queue_session-services-queue',
      name: 'session-services-queue',
    }
    addTestQueueFunction('queue_session-services-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => {
        createWireServicesCalled = true
        return mockWireService as any
      },
    } as any)
    const job = createMockJob('session-services-queue', 'job-444')

    await runQueueJob({
      job,
    })

    assert.equal(createWireServicesCalled, true)
  })

  test('should log errors when job processing fails', async () => {
    const mockWorker: CoreQueueWorker = {
      name: 'error-queue',
      func: {
        func: async () => {
          throw new Error('Processing error')
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['error-queue'] = {
      pikkuFuncId: 'queue_error-queue',
      name: 'error-queue',
    }
    addTestQueueFunction('queue_error-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('error-queue', 'job-555')

    await assert.rejects(
      async () => {
        await runQueueJob({
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
      name: 'middleware-queue',
      func: {
        func: async () => {
          executionOrder.push('job')
          return 'ok'
        },
        auth: false,
      },
      middleware: [middleware],
    }

    pikkuState(null, 'queue', 'meta')['middleware-queue'] = {
      pikkuFuncId: 'queue_middleware-queue',
      name: 'middleware-queue',
    }
    addTestQueueFunction('queue_middleware-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('middleware-queue', 'job-666')

    await runQueueJob({
      job,
    })

    assert.deepEqual(executionOrder, ['middleware', 'job'])
  })

  test('should log debug message on successful job completion', async () => {
    const mockWorker: CoreQueueWorker = {
      name: 'debug-queue',
      func: {
        func: async () => 'success',
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['debug-queue'] = {
      pikkuFuncId: 'queue_debug-queue',
      name: 'debug-queue',
    }
    addTestQueueFunction('queue_debug-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    const job = createMockJob('debug-queue', 'job-777')

    await runQueueJob({
      job,
    })

    const logs = mockLogger.getLogs()
    const debugLogs = logs.filter((l) => l.level === 'debug')
    assert.equal(debugLogs.length, 1)
    assert(debugLogs[0].message.includes('Successfully processed job job-777'))
  })
})

describe('runQueueJob with pikkuState services', () => {
  test('delegates queue job execution using pikkuState services', async () => {
    const mockWorker: CoreQueueWorker = {
      name: 'bound-runner-queue',
      func: {
        func: async (_services: any, data: any) => {
          return data.value + 1
        },
        auth: false,
      },
    }

    pikkuState(null, 'queue', 'meta')['bound-runner-queue'] = {
      pikkuFuncId: 'queue_bound-runner-queue',
      name: 'bound-runner-queue',
    }
    addTestQueueFunction('queue_bound-runner-queue')
    wireQueueWorker(mockWorker)

    const mockLogger = createMockLogger()
    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)

    await runQueueJob({
      job: createMockJob('bound-runner-queue', 'job-888', { value: 41 }),
    })

    const logs = mockLogger.getLogs()
    assert(
      logs.some(
        (log) =>
          log.level === 'debug' &&
          String(log.message).includes('Successfully processed job job-888')
      )
    )
  })
})
