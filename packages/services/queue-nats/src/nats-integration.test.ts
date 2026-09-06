/**
 * Integration tests against a real JetStream server.
 *
 * Skipped automatically when no server is reachable, so this stays safe to run
 * in CI without NATS. To run locally:
 *   docker run -d --rm --name pikku-nats -p 4232:4222 nats:2.14-alpine -js
 *   NATS_TEST_URL=nats://localhost:4232 bash run-tests.sh
 *
 * 2.14 is a floor, not a preference: `assertSchedulerSupport` rejects anything
 * older, so on 2.10 the factory's own init test fails before any queue work
 * happens.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  jetstream,
  jetstreamManager,
  RetentionPolicy,
} from '@nats-io/jetstream'
import { connect, type NatsConnection } from '@nats-io/transport-node'
import { NatsServiceFactory } from './nats-service-factory.js'
import { NatsQueueService } from './nats-queue-service.js'
import { consumeQueue } from './consume.js'
import { mapPikkuWorkerToNats } from './nats-queue-worker.js'
import {
  attemptsFor,
  backoffFor,
  consumerNameForQueue,
  mapJsMsgToQueueJob,
  subjectForQueue,
} from './utils.js'

const SERVER = process.env.NATS_TEST_URL
const PREFIX = 'pikkutest'

// Opt in by env var rather than probing the server, so the whole file resolves
// to skipped tests with no connection attempt when NATS is not available.
const it = SERVER ? test : test.skip

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Fresh stream per test so cases can't see each other's messages. */
const setup = async (streamName: string, queueName: string, batchSize = 10) => {
  const nc: NatsConnection = await connect({ servers: SERVER! })
  const jsm = await jetstreamManager(nc)
  const js = jetstream(nc)

  await jsm.streams.add({
    name: streamName,
    subjects: [`${PREFIX}.${streamName}.>`],
    retention: RetentionPolicy.Workqueue,
    num_replicas: 1,
  })

  const prefix = `${PREFIX}.${streamName}`
  const durable = consumerNameForQueue(prefix, queueName)
  await jsm.consumers.add(streamName, {
    durable_name: durable,
    filter_subject: subjectForQueue(prefix, queueName),
    // 1s so redelivery tests don't take 30s on the server default.
    ...mapPikkuWorkerToNats({ batchSize, lockDuration: 1_000 }),
  })

  const service = new NatsQueueService(js, prefix)
  const consumer = await js.consumers.get(streamName, durable)

  return {
    service,
    consumer,
    nc,
    prefix,
    cleanup: async () => {
      await jsm.streams.delete(streamName).catch(() => {})
      await nc.close()
    },
  }
}

it('a published job is delivered with its payload intact, and ack removes it', async () => {
  const { service, consumer, cleanup } = await setup('PIKKUTEST_BASIC', 'jobs')
  try {
    await service.add('jobs', { hello: 'world', n: 42 })

    const messages = await consumer.consume()
    let received: any
    for await (const msg of messages) {
      received = mapJsMsgToQueueJob('jobs', msg).data
      msg.ack()
      break
    }
    messages.stop()

    assert.deepEqual(received, { hello: 'world', n: 42 })

    // Work-queue retention: an acked message is gone from the stream.
    await delay(300)
    const info = await consumer.info()
    assert.equal(info.num_pending, 0)
    assert.equal(info.num_ack_pending, 0)
  } finally {
    await cleanup()
  }
})

it('pikkuUserId rides through as a header', async () => {
  const { service, consumer, cleanup } = await setup('PIKKUTEST_HDR', 'jobs')
  try {
    await service.add('jobs', { x: 1 }, { pikkuUserId: 'user-abc' })

    const messages = await consumer.consume()
    let userId: string | undefined
    for await (const msg of messages) {
      userId = mapJsMsgToQueueJob('jobs', msg).pikkuUserId
      msg.ack()
      break
    }
    messages.stop()

    assert.equal(userId, 'user-abc')
  } finally {
    await cleanup()
  }
})

it('jobId dedupes a duplicate publish, like a pg-boss singleton key', async () => {
  const { service, consumer, cleanup } = await setup('PIKKUTEST_DEDUPE', 'jobs')
  try {
    await service.add('jobs', { v: 1 }, { jobId: 'same-key' })
    await service.add('jobs', { v: 2 }, { jobId: 'same-key' })
    await delay(300)

    const info = await consumer.info()
    assert.equal(
      info.num_pending,
      1,
      'second publish with the same jobId should be dropped'
    )
  } finally {
    await cleanup()
  }
})

it('nak redelivers, and the attempt count climbs', async () => {
  const { service, consumer, cleanup } = await setup('PIKKUTEST_NAK', 'jobs')
  try {
    await service.add('jobs', { retry: true })

    const messages = await consumer.consume()
    const attempts: number[] = []
    for await (const msg of messages) {
      const job = mapJsMsgToQueueJob('jobs', msg)
      attempts.push((await job.metadata!()).attemptsMade!)
      if (attempts.length >= 2) {
        msg.ack()
        break
      }
      msg.nak()
    }
    messages.stop()

    assert.deepEqual(
      attempts,
      [1, 2],
      'a naked message should come back as a second attempt'
    )
  } finally {
    await cleanup()
  }
})

it('term does NOT redeliver — the discard path is permanent', async () => {
  const { service, consumer, cleanup } = await setup('PIKKUTEST_TERM', 'jobs')
  try {
    await service.add('jobs', { discard: true })

    const messages = await consumer.consume()
    let deliveries = 0
    for await (const msg of messages) {
      deliveries++
      msg.term()
      break
    }
    messages.stop()

    // ack_wait is 1s; wait past it to prove nothing comes back.
    await delay(2_500)
    const info = await consumer.info()
    assert.equal(deliveries, 1)
    assert.equal(
      info.num_pending,
      0,
      'a termed message must not be redelivered'
    )
    assert.equal(info.num_ack_pending, 0)
  } finally {
    await cleanup()
  }
})

it('a slow job does not block the messages behind it', async () => {
  // The regression test for this whole exercise. On pg-boss with batchSize > 1
  // one slow job froze every sibling in its batch AND stalled the next fetch.
  // The equivalent client-side mistake is awaiting each handler in the consume
  // loop. Either way this test fails.
  const { service, consumer, cleanup } = await setup(
    'PIKKUTEST_HOL',
    'jobs',
    10
  )
  try {
    for (let i = 0; i < 5; i++) {
      await service.add('jobs', { i })
    }

    const finished: number[] = []
    const messages = await consumer.consume()
    const done = new Promise<void>((resolve) => {
      void (async () => {
        for await (const msg of messages) {
          // Mirrors the worker: launch, do not await.
          void (async () => {
            const { i } = mapJsMsgToQueueJob<{ i: number }, void>(
              'jobs',
              msg
            ).data
            if (i === 0) await delay(1_500)
            finished.push(i)
            msg.ack()
            if (finished.length === 5) resolve()
          })()
        }
      })()
    })

    await Promise.race([done, delay(10_000)])
    messages.stop()

    assert.equal(finished.length, 5, 'all five jobs should complete')
    assert.notEqual(
      finished[0],
      0,
      'the slow job must not be the first to finish'
    )
    assert.equal(
      finished[finished.length - 1],
      0,
      'the slow job should finish last'
    )
  } finally {
    await cleanup()
  }
})

it('init() is idempotent, and converges a stream whose config changed', async () => {
  // The failure this guards: `streams.add` is STREAM.CREATE and errors when the
  // stream already exists with a different config. Without the update fallback
  // the *second* deploy that changes any stream setting fails at boot — which is
  // exactly the deploy nobody tests before shipping.
  const streamName = 'PIKKUTEST_FACTORY'
  const make = (duplicateWindowMs: number) =>
    new NatsServiceFactory({
      servers: SERVER!,
      streamName,
      subjectPrefix: `${PREFIX}.${streamName}`,
      duplicateWindowMs,
    })

  const first = make(60_000)
  await first.init()
  // Same config, fresh factory: must not throw.
  const again = make(60_000)
  await again.init()
  // Changed config: must converge rather than throw.
  const changed = make(120_000)
  await changed.init()

  const { jsm } = changed.getJetStream()
  const info = await jsm.streams.info(streamName)
  assert.equal(info.config.duplicate_window, 120_000 * 1_000_000)

  await jsm.streams.delete(streamName).catch(() => {})
  await Promise.all([first.close(), again.close(), changed.close()])
})

it('a job that exhausts its attempts is dropped, not retried forever', async () => {
  // The silent break this guards: `attempts` is per-JOB, but JetStream only has
  // per-consumer max_deliver — and unset max_deliver means UNLIMITED. Without
  // client-side enforcement a workflow step marked "do not retry" would be
  // redelivered until it succeeded, i.e. forever.
  const { service, consumer, cleanup } = await setup(
    'PIKKUTEST_ATTEMPTS',
    'jobs'
  )
  try {
    await service.add('jobs', { x: 1 }, { attempts: 2 })

    const messages = await consumer.consume()
    let deliveries = 0
    const done = new Promise<void>((resolve) => {
      void (async () => {
        for await (const msg of messages) {
          deliveries++
          const attempts = attemptsFor(msg)
          if (attempts !== undefined && msg.info.deliveryCount >= attempts) {
            msg.term()
            resolve()
          } else {
            msg.nak()
          }
        }
      })()
    })
    await Promise.race([done, delay(8_000)])
    messages.stop()
    await delay(2_500) // past ack_wait — a termed message must not return

    assert.equal(deliveries, 2, 'should be delivered exactly `attempts` times')
    const info = await consumer.info()
    assert.equal(info.num_pending, 0, 'exhausted job must be gone, not looping')
  } finally {
    await cleanup()
  }
})

it('attempts and backoff survive the round trip as headers', async () => {
  const { service, consumer, cleanup } = await setup('PIKKUTEST_POLICY', 'jobs')
  try {
    await service.add('jobs', { x: 1 }, { attempts: 5, backoff: 'exponential' })

    const messages = await consumer.consume()
    let seen: { attempts?: number; delayMs?: number } = {}
    for await (const msg of messages) {
      seen = { attempts: attemptsFor(msg), delayMs: backoffFor(msg) }
      msg.ack()
      break
    }
    messages.stop()

    assert.equal(seen.attempts, 5)
    // First delivery, exponential, default 1s base → 1s before the next try.
    assert.equal(seen.delayMs, 1_000)
  } finally {
    await cleanup()
  }
})

it('a delayed job is rejected loudly when no delayedPublisher is wired', async () => {
  // Never silently: dropping `delay` turns workflow.sleep('1h') into sleep(0).
  const { service, cleanup } = await setup('PIKKUTEST_DELAY', 'jobs')
  try {
    await assert.rejects(
      () => service.add('jobs', { x: 1 }, { delay: 60_000 }),
      /no delayedPublisher is configured/i
    )
  } finally {
    await cleanup()
  }
})

it('drain waits for an in-flight handler to ack instead of killing it', async () => {
  // The shutdown guarantee: a job already being processed when a deploy lands
  // finishes and acks, rather than being killed and redelivered after ack_wait
  // (which would re-run whatever side effects it had already performed).
  const { service, nc, prefix, cleanup } = await setup(
    'PIKKUTEST_DRAIN',
    'jobs'
  )
  try {
    const jsm = await jetstreamManager(nc)
    const js = jetstream(nc)
    await service.add('jobs', { slow: true })

    let finished = false
    const handle = await consumeQueue({
      js,
      jsm,
      streamName: 'PIKKUTEST_DRAIN',
      subjectPrefix: prefix,
      queueName: 'jobs',
      config: mapPikkuWorkerToNats({ batchSize: 10, lockDuration: 1_000 }),
      handler: async (msg) => {
        await delay(600)
        finished = true
        msg.ack()
      },
    })

    // Wait until the handler has actually picked the message up, so we are
    // testing the drain and not a race against delivery.
    while (handle.inFlight === 0) {
      await delay(10)
    }
    assert.equal(
      finished,
      false,
      'handler should still be running before drain'
    )

    const drained = await handle.drain(5_000)
    assert.equal(drained, true, 'drain should report a clean finish')
    assert.equal(finished, true, 'drain must wait for the in-flight handler')
    assert.equal(handle.inFlight, 0)

    // Acked during the drain, so nothing is left to redeliver.
    const info = await jsm.streams.info('PIKKUTEST_DRAIN')
    assert.equal(
      info.state.messages,
      0,
      'acked job must be gone from the stream'
    )
  } finally {
    await cleanup()
  }
})

it('drain reports false when a handler outlives the budget, and the job survives', async () => {
  // Timing out must be safe, not lossy: the message stays unacked and is
  // redelivered after ack_wait.
  const { service, nc, prefix, cleanup } = await setup(
    'PIKKUTEST_DRAIN_TIMEOUT',
    'jobs'
  )
  try {
    const jsm = await jetstreamManager(nc)
    const js = jetstream(nc)
    await service.add('jobs', { slow: true })

    const handle = await consumeQueue({
      js,
      jsm,
      streamName: 'PIKKUTEST_DRAIN_TIMEOUT',
      subjectPrefix: prefix,
      queueName: 'jobs',
      config: mapPikkuWorkerToNats({ batchSize: 10, lockDuration: 30_000 }),
      // Never acks within the budget.
      handler: async () => {
        await delay(5_000)
      },
    })

    while (handle.inFlight === 0) {
      await delay(10)
    }
    const drained = await handle.drain(300)
    assert.equal(drained, false, 'drain should report it gave up')

    const info = await jsm.streams.info('PIKKUTEST_DRAIN_TIMEOUT')
    assert.equal(
      info.state.messages,
      1,
      'unacked job must remain for redelivery'
    )
  } finally {
    await cleanup()
  }
})

it(
  're-attaches when the pull session ends under it, instead of going silently deaf',
  { timeout: 30_000 },
  async () => {
    // Regression for 2026-08-20: NATS restarted 23 minutes after the backend, the
    // `for await` over `consumer.consume()` ran off the end, and the IIFE driving
    // it simply resolved. The durable consumer still existed and its backlog grew
    // to 1681 messages while the process stayed healthy and said nothing — every
    // deploy silently did nothing for ten hours.
    //
    // Deleting the consumer server-side ends the delivery session the same way a
    // restart does, and is deterministic. What must happen is that the session is
    // re-established and a message published AFTER the break still gets handled.
    const { service, nc, prefix, cleanup } = await setup(
      'PIKKUTEST_REATTACH',
      'jobs'
    )
    try {
      const jsm = await jetstreamManager(nc)
      const js = jetstream(nc)
      const durable = consumerNameForQueue(prefix, 'jobs')

      // Unique per run: a leftover message from an earlier aborted run must never
      // be able to satisfy this test.
      const token = Math.random().toString(36).slice(2, 10)
      const handled: string[] = []
      const logged: string[] = []
      const handle = await consumeQueue({
        js,
        jsm,
        streamName: 'PIKKUTEST_REATTACH',
        subjectPrefix: prefix,
        queueName: 'jobs',
        config: mapPikkuWorkerToNats({ batchSize: 10, lockDuration: 5_000 }),
        handler: async (msg) => {
          handled.push((msg.json() as { id: string }).id)
          msg.ack()
        },
        logger: {
          error: (...args: unknown[]) => {
            logged.push(String(args[0]))
          },
          info: (...args: unknown[]) => {
            logged.push(String(args[0]))
          },
        },
      })

      try {
        await service.add('jobs', { id: `before-${token}` })
        for (let i = 0; i < 200 && !handled.includes(`before-${token}`); i++)
          await delay(25)
        assert.ok(
          handled.includes(`before-${token}`),
          'baseline delivery must work'
        )

        // Kill the delivery session out from under the consumer.
        await jsm.consumers.delete('PIKKUTEST_REATTACH', durable)

        // The supervisor re-creates the durable and resumes pulling. Publish only
        // after the break so a pass cannot come from a message buffered earlier.
        await delay(500)
        await service.add('jobs', { id: `after-${token}` })

        for (let i = 0; i < 400 && !handled.includes(`after-${token}`); i++)
          await delay(25)
        assert.ok(
          handled.includes(`after-${token}`),
          `consumer never re-attached — handled ${JSON.stringify(handled)}`
        )

        // Recovering silently would be almost as bad as not recovering: an
        // operator needs to see that the queue went deaf, even briefly.
        assert.ok(
          logged.some((m) => m.includes('consumer deleted server-side')),
          `the reason was never logged — logged ${JSON.stringify(logged)}`
        )
        assert.ok(
          logged.some((m) => m.includes('re-attached')),
          `the recovery was never logged — logged ${JSON.stringify(logged)}`
        )
      } finally {
        handle.stop()
      }
    } finally {
      await cleanup()
    }
  }
)

it('re-consuming with a CHANGED consumer config converges instead of throwing', async () => {
  // Regression: `consumers.add` is CONSUMER.CREATE and throws "consumer already
  // exists" when a setting differs. Changing a queue's batchSize/lockDuration
  // would then fail at boot on the NEXT deploy — not the one that made the
  // change — so the break would land detached from its cause.
  const { nc, prefix, cleanup } = await setup('PIKKUTEST_CONSUMER_CONV', 'jobs')
  try {
    const jsm = await jetstreamManager(nc)
    const js = jetstream(nc)
    const common = {
      js,
      jsm,
      streamName: 'PIKKUTEST_CONSUMER_CONV',
      subjectPrefix: prefix,
      queueName: 'jobs',
      handler: async () => {},
    }

    const first = await consumeQueue({
      ...common,
      config: mapPikkuWorkerToNats({ batchSize: 5, lockDuration: 2_000 }),
    })
    first.stop()

    const second = await consumeQueue({
      ...common,
      config: mapPikkuWorkerToNats({ batchSize: 25, lockDuration: 9_000 }),
    })
    second.stop()

    const info = await jsm.consumers.info(
      'PIKKUTEST_CONSUMER_CONV',
      consumerNameForQueue(prefix, 'jobs')
    )
    assert.equal(
      info.config.max_ack_pending,
      25,
      'batchSize change must be applied'
    )
    assert.equal(
      info.config.ack_wait,
      9_000 * 1_000_000,
      'lockDuration change must be applied'
    )
  } finally {
    await cleanup()
  }
})
