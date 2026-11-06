import assert from 'node:assert/strict'
import { before, beforeEach, describe, test } from 'node:test'

import { createSecretValue } from '../classification/secret-value.js'
import { pikkuState } from '../pikku-state.js'
import type { Logger } from '../services/logger.js'
import type { SecretService } from '../services/secret-service.js'
import type { CoreSingletonServices } from '../types/core.types.js'
import {
  QUEUE_IDENTITY_SECRET_NAME,
  signQueueIdentity,
} from '../wirings/queue/queue-identity.js'
import { wireQueueWorker } from '../wirings/queue/queue-runner.js'
import type { QueueService } from '../wirings/queue/queue.types.js'
import { SignedQueueService } from '../wirings/queue/signed-queue-service.js'

const QUEUE_NAME = 'identity-transport'
const SECRET = 'a'.repeat(48)
const OTHER_SECRET = 'b'.repeat(48)
const USER = 'user-1'
const SESSION = { userId: USER }
const DATA = { message: 'hello', nested: { n: 1 } }
const TRACE_ID = 'a'.repeat(32)
const TRACEPARENT = `00-${TRACE_ID}-${'b'.repeat(16)}-01`

/** One adapter, cut at the broker: what `queueService` sent, `deliver` consumes. */
export interface QueueIdentityTransport {
  queueService: QueueService
  /** Runs everything sent so far through the adapter's real consumer path. */
  deliver: () => Promise<void>
}

interface WorkerRun {
  data: unknown
  pikkuUserId?: string
  session?: unknown
  traceId?: string
}

/**
 * Conformance for carrying a job's identity claim through an adapter: a signed
 * claim reaches the worker with the user's session, and an unsigned, forged or
 * misbound one leaves the job running as nobody.
 *
 * @param name - The adapter, for the test names.
 * @param create - Builds the adapter. Gets the singleton services its consumer
 *   has to run under.
 */
export const defineQueueIdentityTransportTests = (
  name: string,
  create: (services: CoreSingletonServices) => QueueIdentityTransport
): void => {
  describe(`queue identity transport [${name}]`, () => {
    const runs: WorkerRun[] = []
    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } as unknown as Logger
    const secrets = {
      getSecret: async () => createSecretValue(SECRET),
      hasSecret: async (key: string) => key === QUEUE_IDENTITY_SECRET_NAME,
    } as unknown as SecretService
    const services = {
      logger,
      secrets,
      sessionStore: {
        get: async (id: string) => (id === USER ? SESSION : undefined),
      },
    } as unknown as CoreSingletonServices
    let transport: QueueIdentityTransport

    before(() => {
      pikkuState(null, 'queue', 'meta')[QUEUE_NAME] = {
        pikkuFuncId: `queue_${QUEUE_NAME}`,
        name: QUEUE_NAME,
      } as never
      pikkuState(null, 'function', 'meta')[`queue_${QUEUE_NAME}`] = {
        pikkuFuncId: `queue_${QUEUE_NAME}`,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      } as never
      wireQueueWorker({
        name: QUEUE_NAME,
        func: {
          auth: false,
          func: async (
            _services: unknown,
            data: unknown,
            wire: Record<string, any>
          ) => {
            runs.push({
              data,
              pikkuUserId: wire.pikkuUserId,
              session: wire.session,
              traceId: wire.traceId,
            })
          },
        },
      } as never)
      transport = create(services)
    })

    beforeEach(() => {
      runs.length = 0
      pikkuState(null, 'package', 'singletonServices', services)
    })

    const deliverOne = async (): Promise<WorkerRun> => {
      await transport.deliver()
      assert.equal(runs.length, 1, 'the job ran once')
      return runs[0]!
    }

    const assertRanAsNobody = async () => {
      const run = await deliverOne()
      assert.equal(run.pikkuUserId, undefined)
      assert.equal(run.session, undefined)
      return run
    }

    test('a signed claim reaches the worker with the session', async () => {
      await new SignedQueueService(transport.queueService, secrets, logger).add(
        QUEUE_NAME,
        DATA,
        { pikkuUserId: USER }
      )

      const run = await deliverOne()
      assert.equal(run.pikkuUserId, USER)
      assert.deepEqual(run.session, SESSION)
      assert.deepEqual(run.data, DATA)
    })

    test('the identity and the trace travel together', async () => {
      await new SignedQueueService(transport.queueService, secrets, logger).add(
        QUEUE_NAME,
        DATA,
        { pikkuUserId: USER, traceparent: TRACEPARENT }
      )

      const run = await deliverOne()
      assert.equal(run.pikkuUserId, USER)
      assert.equal(run.traceId, TRACE_ID)
      assert.deepEqual(run.data, DATA)
    })

    test('a job with no claim runs as nobody', async () => {
      await transport.queueService.add(QUEUE_NAME, DATA)
      const run = await assertRanAsNobody()
      assert.deepEqual(run.data, DATA)
    })

    test('an unsigned claim is dropped', async () => {
      await transport.queueService.add(QUEUE_NAME, DATA, { pikkuUserId: USER })
      const run = await assertRanAsNobody()
      assert.deepEqual(run.data, DATA)
    })

    test('a claim signed with another secret is dropped', async () => {
      await transport.queueService.add(QUEUE_NAME, DATA, {
        pikkuUserId: await signQueueIdentity(OTHER_SECRET, USER, {
          queueName: QUEUE_NAME,
          data: DATA,
        }),
      })
      await assertRanAsNobody()
    })

    test('a tampered claim is dropped', async () => {
      const [version, , signature] = (
        await signQueueIdentity(SECRET, 'someone-else', {
          queueName: QUEUE_NAME,
          data: DATA,
        })
      ).split('.')
      const [, claim] = (
        await signQueueIdentity(SECRET, USER, {
          queueName: QUEUE_NAME,
          data: DATA,
        })
      ).split('.')
      await transport.queueService.add(QUEUE_NAME, DATA, {
        pikkuUserId: `${version}.${claim}.${signature}`,
      })
      await assertRanAsNobody()
    })

    test('a claim signed for another payload is dropped', async () => {
      await transport.queueService.add(QUEUE_NAME, DATA, {
        pikkuUserId: await signQueueIdentity(SECRET, USER, {
          queueName: QUEUE_NAME,
          data: { message: 'other' },
        }),
      })
      await assertRanAsNobody()
    })

    test('a claim signed for another queue is dropped', async () => {
      await transport.queueService.add(QUEUE_NAME, DATA, {
        pikkuUserId: await signQueueIdentity(SECRET, USER, {
          queueName: 'another-queue',
          data: DATA,
        }),
      })
      await assertRanAsNobody()
    })

    test('identity fields inside the payload grant nothing', async () => {
      await transport.queueService.add(QUEUE_NAME, {
        pikkuUserId: USER,
        __pikkuUserId: USER,
        data: DATA,
      })
      await assertRanAsNobody()
    })
  })
}
