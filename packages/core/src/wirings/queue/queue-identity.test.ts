import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { wireQueueWorker, runQueueJob } from './queue-runner.js'
import {
  QUEUE_IDENTITY_INFO,
  QUEUE_IDENTITY_SECRET_NAME,
  resetQueueIdentityLogLatch,
  signQueueIdentity,
} from './queue-identity.js'
import {
  REMOTE_SESSION_INFO,
  signWithKeyMaterial,
  verifyWithKeyMaterial,
} from '../../crypto-utils.js'
import { WeakKeyMaterialError } from '../../errors/errors.js'
import { SignedQueueService } from './signed-queue-service.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import type {
  CoreQueueWorker,
  JobOptions,
  QueueJob,
  QueueService,
} from './queue.types.js'
import { createSecretValue } from '../../classification/secret-value.js'

const QUEUE_NAME = 'identity-queue'
const SECRET = 'a'.repeat(48)
const JOB_DATA = { message: 'hello' }

beforeEach(() => {
  resetPikkuState()
  resetQueueIdentityLogLatch()
})

const createMockLogger = () => {
  const logs: Array<{ level: string; message: string }> = []
  return {
    info: (msg: any) => logs.push({ level: 'info', message: String(msg) }),
    warn: (msg: any) => logs.push({ level: 'warn', message: String(msg) }),
    error: (msg: any) => logs.push({ level: 'error', message: String(msg) }),
    debug: (msg: any) => logs.push({ level: 'debug', message: String(msg) }),
    getLogs: () => logs,
  }
}

const createSecretService = (secrets: Record<string, string>) =>
  ({
    getSecret: async (key: string) => {
      const value = secrets[key]
      if (value === undefined) {
        throw new Error(`Secret not found: ${key}`)
      }
      return createSecretValue(value)
    },
    hasSecret: async (key: string) => secrets[key] !== undefined,
    setSecret: async () => {},
    deleteSecret: async () => {},
    getSecrets: async () => ({}),
  }) as any

type Capture = {
  ran: boolean
  pikkuUserId?: string
  queuePikkuUserId?: string
}

const wireIdentityWorker = (capture: Capture, queueName = QUEUE_NAME) => {
  const worker: CoreQueueWorker = {
    name: queueName,
    func: {
      func: async (_services: any, _data: any, wire: any) => {
        capture.ran = true
        capture.pikkuUserId = wire.pikkuUserId
        capture.queuePikkuUserId = wire.queue.pikkuUserId
        return 'ok'
      },
      auth: false,
    },
  }
  pikkuState(null, 'queue', 'meta')[queueName] = {
    pikkuFuncId: `queue_${queueName}`,
    name: queueName,
  }
  pikkuState(null, 'function', 'meta')[`queue_${queueName}`] = {
    pikkuFuncId: `queue_${queueName}`,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
    middleware: undefined,
    permissions: undefined,
  }
  wireQueueWorker(worker)
}

const useSingletonServices = (
  logger: ReturnType<typeof createMockLogger>,
  secrets?: Record<string, string>
) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger,
    ...(secrets ? { secrets: createSecretService(secrets) } : {}),
  } as any)
}

const createJob = (
  overrides: Partial<QueueJob> & { pikkuUserId?: string } = {}
): QueueJob => ({
  id: 'job-1',
  queueName: QUEUE_NAME,
  status: async () => 'active' as const,
  data: JOB_DATA,
  ...overrides,
})

describe('queue job identity', () => {
  test('a forged pikkuUserId is not honoured', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    await runQueueJob({ job: createJob({ pikkuUserId: 'victim-user' }) })

    assert.equal(capture.ran, true)
    assert.equal(capture.pikkuUserId, undefined)
    assert.equal(capture.queuePikkuUserId, undefined)
    assert.equal(
      logger.getLogs().filter((l) => l.level === 'error').length,
      1,
      'the rejection is reported'
    )
  })

  test('a tampered signed claim is not honoured', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    const signed = await signQueueIdentity(SECRET, 'user-1', {
      queueName: QUEUE_NAME,
      data: JOB_DATA,
    })
    const [version, claim, signature] = signed.split('.') as [
      string,
      string,
      string,
    ]
    const forgedClaim = Buffer.from(
      JSON.stringify({ u: 'victim-user', q: QUEUE_NAME })
    ).toString('base64url')

    await runQueueJob({
      job: createJob({
        pikkuUserId: `${version}.${forgedClaim}.${signature}`,
      }),
    })

    assert.equal(capture.ran, true)
    assert.equal(capture.pikkuUserId, undefined)
    assert.equal(claim !== forgedClaim, true)
  })

  test('a correctly signed job resolves its identity', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    const signed = await signQueueIdentity(SECRET, 'user-1', {
      queueName: QUEUE_NAME,
      data: JOB_DATA,
    })

    await runQueueJob({ job: createJob({ pikkuUserId: signed }) })

    assert.equal(capture.pikkuUserId, 'user-1')
    assert.equal(capture.queuePikkuUserId, 'user-1')
    assert.equal(logger.getLogs().filter((l) => l.level === 'error').length, 0)
  })

  test('a signature is rejected when lifted onto another queue', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture, 'other-queue')

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    const signed = await signQueueIdentity(SECRET, 'user-1', {
      queueName: QUEUE_NAME,
      data: JOB_DATA,
    })

    await runQueueJob({
      job: createJob({ queueName: 'other-queue', pikkuUserId: signed }),
    })

    assert.equal(capture.ran, true)
    assert.equal(capture.pikkuUserId, undefined)
  })

  test('a signature is rejected when lifted onto a different payload', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    const signed = await signQueueIdentity(SECRET, 'user-1', {
      queueName: QUEUE_NAME,
      data: JOB_DATA,
    })

    await runQueueJob({
      job: createJob({
        id: 'job-2',
        data: { message: 'attacker payload' },
        pikkuUserId: signed,
      }),
    })

    assert.equal(capture.ran, true)
    assert.equal(capture.pikkuUserId, undefined)
  })

  test('a signature bound to a jobId is rejected on a different jobId', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    const signed = await signQueueIdentity(SECRET, 'user-1', {
      queueName: QUEUE_NAME,
      jobId: 'job-1',
      data: JOB_DATA,
    })

    await runQueueJob({ job: createJob({ pikkuUserId: signed }) })
    assert.equal(capture.pikkuUserId, 'user-1')

    capture.pikkuUserId = undefined
    await runQueueJob({ job: createJob({ id: 'job-9', pikkuUserId: signed }) })
    assert.equal(capture.pikkuUserId, undefined)
  })

  test('payload property order does not change the signature binding', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    const signed = await signQueueIdentity(SECRET, 'user-1', {
      queueName: QUEUE_NAME,
      data: { a: 1, b: { c: 2, d: [3, 'four'] } },
    })

    await runQueueJob({
      job: createJob({
        data: { b: { d: [3, 'four'], c: 2 }, a: 1 },
        pikkuUserId: signed,
      }),
    })

    assert.equal(capture.pikkuUserId, 'user-1')
  })

  test('a job with no identity claim is unaffected', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    await runQueueJob({ job: createJob() })

    assert.equal(capture.ran, true)
    assert.equal(capture.pikkuUserId, undefined)
    assert.equal(
      logger.getLogs().filter((l) => l.level === 'error').length,
      0,
      'nothing is rejected because nothing was claimed'
    )
  })

  test('without a configured secret the identity is dropped, the job still runs, and the warning is logged once', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger)

    await runQueueJob({ job: createJob({ pikkuUserId: 'victim-user' }) })
    assert.equal(capture.ran, true)
    assert.equal(capture.pikkuUserId, undefined)

    capture.ran = false
    await runQueueJob({
      job: createJob({ id: 'job-2', pikkuUserId: 'victim-user' }),
    })
    assert.equal(capture.ran, true, 'the queue keeps processing')
    assert.equal(capture.pikkuUserId, undefined)

    const warnings = logger
      .getLogs()
      .filter((l) => l.level === 'warn' && l.message.includes('is configured'))
    assert.equal(warnings.length, 1, 'warned once per process, not per job')
  })
})

describe('queue identity key derivation', () => {
  test('a signature does not verify under another info namespace', async () => {
    const payload = 'pq1.claim.{}'
    const signature = await signWithKeyMaterial(
      QUEUE_IDENTITY_SECRET_NAME,
      SECRET,
      QUEUE_IDENTITY_INFO,
      payload
    )

    assert.equal(
      await verifyWithKeyMaterial(
        QUEUE_IDENTITY_SECRET_NAME,
        SECRET,
        QUEUE_IDENTITY_INFO,
        payload,
        signature
      ),
      true
    )
    assert.equal(
      await verifyWithKeyMaterial(
        QUEUE_IDENTITY_SECRET_NAME,
        SECRET,
        REMOTE_SESSION_INFO,
        payload,
        signature
      ),
      false
    )
  })

  test('a secret shorter than the minimum is rejected at signing time', async () => {
    await assert.rejects(
      () =>
        signQueueIdentity('short-secret', 'user-1', {
          queueName: QUEUE_NAME,
          data: JOB_DATA,
        }),
      (error: any) => error instanceof WeakKeyMaterialError
    )
  })

  test('a secret shorter than the minimum drops the identity at the worker', async () => {
    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)

    const logger = createMockLogger()
    useSingletonServices(logger, {
      [QUEUE_IDENTITY_SECRET_NAME]: 'short-secret',
    })

    await runQueueJob({ job: createJob({ pikkuUserId: 'victim-user' }) })

    assert.equal(capture.ran, true, 'the queue keeps processing')
    assert.equal(capture.pikkuUserId, undefined)
    assert.equal(logger.getLogs().filter((l) => l.level === 'error').length, 1)
  })
})

describe('SignedQueueService', () => {
  const createRecordingQueue = () => {
    const calls: Array<{
      queueName: string
      data: unknown
      options?: JobOptions
    }> = []
    const queueService: QueueService = {
      supportsResults: true,
      add: async (queueName, data, options) => {
        calls.push({ queueName, data, options })
        return 'job-1'
      },
      getJob: async () => null,
    }
    return { calls, queueService }
  }

  test('signs the identity so the worker resolves it end to end', async () => {
    const { calls, queueService } = createRecordingQueue()
    const logger = createMockLogger()
    const signing = new SignedQueueService(
      queueService,
      createSecretService({ [QUEUE_IDENTITY_SECRET_NAME]: SECRET }),
      logger as any
    )

    await signing.add(QUEUE_NAME, JOB_DATA, { pikkuUserId: 'user-1' })

    const enqueued = calls[0]!
    assert.notEqual(enqueued.options?.pikkuUserId, 'user-1')
    assert.equal(enqueued.options?.pikkuUserId?.startsWith('pq1.'), true)

    const capture: Capture = { ran: false }
    wireIdentityWorker(capture)
    useSingletonServices(logger, { [QUEUE_IDENTITY_SECRET_NAME]: SECRET })

    await runQueueJob({
      job: createJob({ pikkuUserId: enqueued.options?.pikkuUserId }),
    })

    assert.equal(capture.pikkuUserId, 'user-1')
  })

  test('drops the identity and warns once when no secret is configured', async () => {
    const { calls, queueService } = createRecordingQueue()
    const logger = createMockLogger()
    const signing = new SignedQueueService(
      queueService,
      createSecretService({}),
      logger as any
    )

    await signing.add(QUEUE_NAME, JOB_DATA, { pikkuUserId: 'user-1' })
    await signing.add(QUEUE_NAME, JOB_DATA, { pikkuUserId: 'user-2' })

    assert.equal(calls[0]?.options?.pikkuUserId, undefined)
    assert.equal(calls[1]?.options?.pikkuUserId, undefined)
    assert.equal(
      logger.getLogs().filter((l) => l.level === 'warn').length,
      1,
      'warned once per process, not per enqueue'
    )
  })

  test('passes jobs without an identity straight through', async () => {
    const { calls, queueService } = createRecordingQueue()
    const logger = createMockLogger()
    const signing = new SignedQueueService(
      queueService,
      createSecretService({ [QUEUE_IDENTITY_SECRET_NAME]: SECRET }),
      logger as any
    )

    await signing.add(QUEUE_NAME, JOB_DATA, { attempts: 3 })

    assert.deepEqual(calls[0]?.options, { attempts: 3 })
    assert.equal(logger.getLogs().length, 0)
  })
})
