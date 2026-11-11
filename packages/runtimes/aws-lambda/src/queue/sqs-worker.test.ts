import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { SQSClient } from '@aws-sdk/client-sqs'
import { runQueueJob } from '@pikku/core/queue'
import { defineQueueIdentityTransportTests } from '@pikku/core/testing'

import { SQSQueueService } from '../sqs-queue-service.js'
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

const lowerAttributes = (attributes: Record<string, any> = {}) =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, attribute]) => [
      key,
      { stringValue: attribute.StringValue, dataType: attribute.DataType },
    ])
  )

defineQueueIdentityTransportTests('sqs on lambda', () => {
  const sent: any[] = []
  const queueService = new SQSQueueService({
    'identity-transport': 'https://sqs.example/identity-transport',
  })
  ;(queueService as any).client = {
    send: async (command: any) => {
      sent.push(command.input)
      return { MessageId: `m-${sent.length}` }
    },
  } as Partial<SQSClient>
  return {
    queueService,
    deliver: async () => {
      for (const input of sent.splice(0)) {
        await runQueueJob({
          job: mapSQSRecordToQueueJob({
            messageId: 'm1',
            body: input.MessageBody,
            eventSourceARN: 'arn:aws:sqs:us-east-1:1:identity-transport',
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1',
            },
            messageAttributes: lowerAttributes(input.MessageAttributes),
          } as any),
        })
      }
    },
  }
})
