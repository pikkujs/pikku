import { test, describe, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as sinon from 'sinon'
import type { SendMessageCommand } from '@aws-sdk/client-sqs'
import { SQSClient } from '@aws-sdk/client-sqs'
import { SQSQueueService } from './sqs-queue-service.js'

let sendStub: sinon.SinonStub

afterEach(() => {
  if (sendStub) {
    sendStub.restore()
  }
})

describe('SQSQueueService', () => {
  test('constructor initializes with correct config', () => {
    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    assert.ok(service, 'Service should be initialized')
    assert.strictEqual(
      service.supportsResults,
      false,
      'Should not support results'
    )
  })

  test('add() sends message to SQS and returns message ID', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: 'test-message-id-123',
    })

    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    const messageId = await service.add('test-queue', { hello: 'world' })

    assert.strictEqual(
      messageId,
      'test-message-id-123',
      'Should return message ID'
    )
    assert.strictEqual(sendStub.callCount, 1, 'Should call send once')

    const command = sendStub.getCall(0).args[0] as SendMessageCommand
    assert.strictEqual(
      command.input.QueueUrl,
      'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
      'Should construct correct queue URL'
    )
    assert.strictEqual(
      command.input.MessageBody,
      JSON.stringify({ hello: 'world' }),
      'Should stringify message body'
    )
    assert.strictEqual(
      command.input.DelaySeconds,
      undefined,
      'Should not set delay when not provided'
    )
  })

  test('add() converts delay from milliseconds to seconds', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: 'test-message-id-delay',
    })

    const service = new SQSQueueService({
      region: 'us-west-2',
      queueUrlPrefix: 'https://sqs.us-west-2.amazonaws.com/987654321/',
    })

    await service.add('delayed-queue', { data: 'test' }, { delay: 5000 })

    const command = sendStub.getCall(0).args[0] as SendMessageCommand
    assert.strictEqual(
      command.input.DelaySeconds,
      5,
      'Should convert 5000ms to 5 seconds'
    )
  })

  test('add() floors fractional seconds', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: 'test-message-id-fractional',
    })

    const service = new SQSQueueService({
      region: 'us-west-2',
      queueUrlPrefix: 'https://sqs.us-west-2.amazonaws.com/987654321/',
    })

    await service.add('delayed-queue', { data: 'test' }, { delay: 5500 })

    const command = sendStub.getCall(0).args[0] as SendMessageCommand
    assert.strictEqual(
      command.input.DelaySeconds,
      5,
      'Should floor 5500ms to 5 seconds'
    )
  })

  test('add() throws error when delay exceeds 900 seconds', async () => {
    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    await assert.rejects(
      async () => {
        await service.add('test-queue', { data: 'test' }, { delay: 901000 })
      },
      /SQS delay cannot exceed 900 seconds/,
      'Should throw error for delay > 900 seconds'
    )
  })

  test('add() throws error when delay is negative', async () => {
    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    await assert.rejects(
      async () => {
        await service.add('test-queue', { data: 'test' }, { delay: -1000 })
      },
      /SQS delay cannot be negative/,
      'Should throw error for negative delay'
    )
  })

  test('add() caches queue URLs', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: 'test-message-id-cache',
    })

    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    // Send two messages to the same queue
    await service.add('cache-test-queue', { msg: 1 })
    await service.add('cache-test-queue', { msg: 2 })

    // Both should use the same constructed URL
    const command1 = sendStub.getCall(0).args[0] as SendMessageCommand
    const command2 = sendStub.getCall(1).args[0] as SendMessageCommand

    assert.strictEqual(
      command1.input.QueueUrl,
      command2.input.QueueUrl,
      'Should reuse cached queue URL'
    )
    assert.strictEqual(
      command1.input.QueueUrl,
      'https://sqs.us-east-1.amazonaws.com/123456789/cache-test-queue',
      'Should have correct cached URL'
    )
  })

  test('add() throws error when SQS returns no MessageId', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: undefined,
    })

    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    await assert.rejects(
      async () => {
        await service.add('test-queue', { data: 'test' })
      },
      /Failed to send message to queue/,
      'Should throw error when MessageId is missing'
    )
  })

  test('getJob() throws unsupported error', async () => {
    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    await assert.rejects(
      async () => {
        await service.getJob('test-queue', 'job-id-123')
      },
      /SQSQueueService does not support getJob/,
      'Should throw error indicating operation not supported'
    )
  })

  test('constructor accepts optional endpoint for LocalStack', () => {
    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'http://localhost:4566/000000000000/',
      endpoint: 'http://localhost:4566',
    })

    assert.ok(service, 'Service should initialize with custom endpoint')
  })

  test('add() handles complex data types', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: 'complex-data-id',
    })

    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    const complexData = {
      user: { id: 123, name: 'Test User' },
      items: [1, 2, 3],
      metadata: { timestamp: new Date('2024-01-01').toISOString() },
    }

    await service.add('complex-queue', complexData)

    const command = sendStub.getCall(0).args[0] as SendMessageCommand
    assert.strictEqual(
      command.input.MessageBody,
      JSON.stringify(complexData),
      'Should correctly stringify complex data'
    )
  })

  test('add() handles delay of 0 seconds', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: 'zero-delay-id',
    })

    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    await service.add('test-queue', { data: 'test' }, { delay: 0 })

    const command = sendStub.getCall(0).args[0] as SendMessageCommand
    assert.strictEqual(
      command.input.DelaySeconds,
      0,
      'Should accept delay of 0 seconds'
    )
  })

  test('add() handles maximum allowed delay (900 seconds)', async () => {
    sendStub = sinon.stub(SQSClient.prototype, 'send').resolves({
      MessageId: 'max-delay-id',
    })

    const service = new SQSQueueService({
      region: 'us-east-1',
      queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/',
    })

    await service.add('test-queue', { data: 'test' }, { delay: 900000 })

    const command = sendStub.getCall(0).args[0] as SendMessageCommand
    assert.strictEqual(
      command.input.DelaySeconds,
      900,
      'Should accept maximum delay of 900 seconds'
    )
  })
})
