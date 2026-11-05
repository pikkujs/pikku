import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { mapSQSRecordToQueueJob } from './sqs-worker.js'

const record = (messageAttributes: Record<string, any> = {}) =>
  ({
    messageId: 'm1',
    body: '{"n":1}',
    eventSourceARN: 'arn:aws:sqs:us-east-1:1:jobs',
    attributes: { ApproximateReceiveCount: '1' },
    messageAttributes,
  }) as any

describe('mapSQSRecordToQueueJob', () => {
  test('reads the traceparent from a message attribute', () => {
    const traceparent = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`
    const job = mapSQSRecordToQueueJob(
      record({ traceparent: { stringValue: traceparent } })
    )
    assert.equal(job.traceparent, traceparent)
  })

  test('a message sent without one has no traceparent', () => {
    assert.equal(mapSQSRecordToQueueJob(record()).traceparent, undefined)
  })
})
