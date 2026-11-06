import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { BadRequestError } from '../../errors/errors.js'
import {
  pikkuState,
  resetPikkuState,
  setSingletonServices,
} from '../../pikku-state.js'
import { wireQueueWorker } from '../queue/queue-runner.js'
import { pikkuRemoteQueueJobFunc } from '../queue/remote-queue-job.js'
import { pikkuRemoteScheduledJobFunc } from './remote-scheduled-job.js'

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any

describe('pikkuRemoteScheduledJobFunc', () => {
  test('acks a task this deployment does not have rather than asking for a retry', async () => {
    resetPikkuState()
    setSingletonServices({ logger: silentLogger } as any)
    await assert.rejects(
      pikkuRemoteScheduledJobFunc(
        { logger: silentLogger },
        {
          taskName: 'not-a-task',
        }
      ),
      BadRequestError
    )
  })
})

describe('remote job traces', () => {
  const traceparent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`

  const setupWorker = () => {
    resetPikkuState()
    setSingletonServices({ logger: silentLogger } as any)
    const seen: any[] = []
    pikkuState(null, 'queue', 'meta')['remote-queue'] = {
      pikkuFuncId: 'remote_fn',
      name: 'remote-queue',
    }
    pikkuState(null, 'function', 'meta')['remote_fn'] = {
      pikkuFuncId: 'remote_fn',
      sessionless: true,
    } as any
    wireQueueWorker({
      name: 'remote-queue',
      func: {
        func: async (_services: any, _data: any, wire: any) => {
          seen.push(wire)
        },
        auth: false,
      },
    } as any)
    return seen
  }

  test('a remote queue job continues its traceparent', async () => {
    const seen = setupWorker()
    await pikkuRemoteQueueJobFunc(
      { logger: silentLogger },
      { queueName: 'remote-queue', data: {}, jobId: 'job-1', traceparent }
    )
    assert.equal(seen[0].trace.traceId, 'a'.repeat(32))
    assert.equal(seen[0].trace.parentSpanId, 'b'.repeat(16))
    assert.equal(seen[0].queue.jobId, 'job-1')
  })

  test('a remote job id never comes from the trace', async () => {
    const seen = setupWorker()
    await pikkuRemoteQueueJobFunc(
      { logger: silentLogger },
      { queueName: 'remote-queue', data: {}, traceparent }
    )
    assert.match(seen[0].queue.jobId, /^remote-/)
    assert.ok(!seen[0].queue.jobId.includes('a'.repeat(32)))
  })
})
