import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { JsMsg } from '@nats-io/jetstream'
import { TRACEPARENT_HEADER } from './utils.js'
import { NatsQueueWorkers } from './nats-queue-worker.js'

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736'

const run = async (traceparent: string | undefined, deliveryCount: number) => {
  const logged: Array<{ scope?: string; message: string }> = []
  const logger = (scope?: string): any => ({
    info: () => {},
    warn: () => {},
    debug: () => {},
    error: (message: string) => void logged.push({ scope, message }),
    scope: (traceId: string) => logger(traceId),
  })
  const msg = {
    seq: 1,
    info: { deliveryCount, timestampNanos: 0, redeliveryCount: 0 },
    headers: {
      get: (name: string) =>
        name === TRACEPARENT_HEADER ? (traceparent ?? '') : '2',
    },
    json: () => ({}),
    term: () => {},
    nak: () => {},
    ack: () => {},
  } as unknown as JsMsg
  const workers = new NatsQueueWorkers(
    {} as never,
    {} as never,
    'stream',
    'prefix',
    {}
  )
  // The queue has no worker, so the job fails however it is run.
  await (workers as any).handleMessage('no-such-queue', msg, logger())
  return logged
}

describe('a job that fails on NATS', () => {
  const traceparent = `00-${TRACE}-00f067aa0ba902b7-01`

  test('logs a retry under its trace', async () => {
    const [log] = (await run(traceparent, 1)).filter(({ message }) =>
      message.includes('retrying')
    )
    assert.equal(log?.scope, TRACE)
  })

  test('logs giving up under its trace', async () => {
    const [log] = (await run(traceparent, 2)).filter(({ message }) =>
      message.includes('giving up')
    )
    assert.equal(log?.scope, TRACE)
  })

  test('logs unscoped when it carries no valid trace', async () => {
    const [log] = (await run('garbage', 2)).filter(({ message }) =>
      message.includes('giving up')
    )
    assert.equal(log?.scope, undefined)
  })
})
