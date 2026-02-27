import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createAssistantUIChannel,
  parseAssistantUIInput,
} from './ai-agent-assistant-ui.js'
import type { AIStreamChannel, AIStreamEvent } from './ai-agent.types.js'

function createMockChannel(): AIStreamChannel & { sent: unknown[] } {
  const sent: unknown[] = []
  return {
    channelId: 'test-channel',
    openingData: undefined,
    state: 'open' as const,
    sent,
    send: (data: unknown) => {
      sent.push(data)
    },
    close: () => {},
  }
}

describe('createAssistantUIChannel', () => {
  test('sends start event before first content', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({ type: 'text-delta', text: 'Hello' })

    assert.equal(parent.sent.length, 2)
    const start = parent.sent[0] as any
    assert.equal(start.type, 'start')
    assert.ok(start.messageId)
  })

  test('sends start only once', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({ type: 'text-delta', text: 'Hello' })
    channel.send({ type: 'text-delta', text: ' world' })

    const startEvents = parent.sent.filter((e: any) => e.type === 'start')
    assert.equal(startEvents.length, 1)
  })

  test('maps text-delta correctly', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({ type: 'text-delta', text: 'Hello' })

    const delta = parent.sent[1] as any
    assert.equal(delta.type, 'text-delta')
    assert.equal(delta.textDelta, 'Hello')
  })

  test('maps reasoning-delta correctly', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({ type: 'reasoning-delta', text: 'thinking...' })

    const delta = parent.sent[1] as any
    assert.equal(delta.type, 'reasoning-delta')
    assert.equal(delta.delta, 'thinking...')
  })

  test('expands tool-call into start/delta/end', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({
      type: 'tool-call',
      toolCallId: 'tc-1',
      toolName: 'search',
      args: { query: 'hello' },
    })

    assert.equal(parent.sent.length, 4)
    const start = parent.sent[1] as any
    assert.equal(start.type, 'tool-call-start')
    assert.equal(start.id, 'tc-1')
    assert.equal(start.toolCallId, 'tc-1')
    assert.equal(start.toolName, 'search')

    const delta = parent.sent[2] as any
    assert.equal(delta.type, 'tool-call-delta')
    assert.equal(delta.argsText, '{"query":"hello"}')

    const end = parent.sent[3] as any
    assert.equal(end.type, 'tool-call-end')
  })

  test('buffers tool-result and flushes after finish-step', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({
      type: 'tool-call',
      toolCallId: 'tc-1',
      toolName: 'search',
      args: { query: 'hello' },
    })
    channel.send({
      type: 'tool-result',
      toolCallId: 'tc-1',
      toolName: 'search',
      result: { data: [1, 2, 3] },
    })

    const beforeUsage = parent.sent.filter((e: any) => e.type === 'tool-result')
    assert.equal(beforeUsage.length, 0)

    channel.send({
      type: 'usage',
      tokens: { input: 100, output: 50 },
      model: 'gpt-4o',
    })

    const afterUsage = parent.sent.filter((e: any) => e.type === 'tool-result')
    assert.equal(afterUsage.length, 1)
    assert.equal(afterUsage[0].toolCallId, 'tc-1')
    assert.deepEqual(afterUsage[0].result, { data: [1, 2, 3] })
  })

  test('silently ignores agent-call (covered by tool-call)', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({
      type: 'agent-call',
      agentName: 'sub-agent',
      session: 'sess-1',
      input: { message: 'do something' },
    })

    assert.equal(parent.sent.length, 0)
  })

  test('silently ignores agent-result (covered by tool-result)', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({
      type: 'agent-result',
      agentName: 'sub-agent',
      session: 'sess-1',
      result: 'done!',
    })

    assert.equal(parent.sent.length, 0)
  })

  test('maps usage to finish-step with token counts', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({
      type: 'usage',
      tokens: { input: 100, output: 50 },
      model: 'gpt-4o',
    })

    const step = parent.sent[1] as any
    assert.equal(step.type, 'finish-step')
    assert.equal(step.finishReason, 'stop')
    assert.deepEqual(step.usage, { promptTokens: 100, completionTokens: 50 })
    assert.equal(step.isContinued, false)
  })

  test('maps error correctly', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({ type: 'error', message: 'something went wrong' })

    const err = parent.sent[1] as any
    assert.equal(err.type, 'error')
    assert.equal(err.errorText, 'something went wrong')
  })

  test('maps approval-request to data event', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    const event: AIStreamEvent = {
      type: 'approval-request',
      toolCallId: 'tc-1',
      toolName: 'deleteTodo',
      args: { id: 5 },
    }
    channel.send(event)

    const chunk = parent.sent[1] as any
    assert.equal(chunk.type, 'data-approval-request')
    assert.deepEqual(chunk.data, event)
  })

  test('maps suspended to data event', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    const event: AIStreamEvent = {
      type: 'suspended',
      reason: 'rpc-missing',
      missingRpcs: ['listTodos'],
    }
    channel.send(event)

    const chunk = parent.sent[1] as any
    assert.equal(chunk.type, 'data-suspended')
    assert.deepEqual(chunk.data, event)
  })

  test('done produces finish + raw [DONE] string + calls close', () => {
    const parent = createMockChannel()
    let closed = false
    parent.close = () => {
      closed = true
    }
    const channel = createAssistantUIChannel(parent)

    channel.send({ type: 'text-delta', text: 'hi' })
    channel.send({ type: 'done' })

    const finish = parent.sent[2] as any
    assert.equal(finish.type, 'finish')
    assert.equal(finish.finishReason, 'stop')

    assert.equal(parent.sent[3], '[DONE]')
    assert.ok(closed)
  })

  test('accumulates usage across multiple steps', () => {
    const parent = createMockChannel()
    const channel = createAssistantUIChannel(parent)

    channel.send({
      type: 'usage',
      tokens: { input: 100, output: 50 },
      model: 'gpt-4o',
    })
    channel.send({
      type: 'usage',
      tokens: { input: 200, output: 100 },
      model: 'gpt-4o',
    })
    channel.send({ type: 'done' })

    const finish = parent.sent.find((e: any) => e.type === 'finish') as any
    assert.deepEqual(finish.usage, {
      promptTokens: 300,
      completionTokens: 150,
    })
  })

  test('preserves parent channelId and openingData', () => {
    const parent = createMockChannel()
    parent.channelId = 'my-channel'
    parent.openingData = { foo: 'bar' }

    const channel = createAssistantUIChannel(parent)

    assert.equal(channel.channelId, 'my-channel')
    assert.deepEqual(channel.openingData, { foo: 'bar' })
  })
})

describe('parseAssistantUIInput', () => {
  test('extracts last user message with string content', () => {
    const result = parseAssistantUIInput({
      messages: [
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'response' },
        { role: 'user', content: 'second message' },
      ],
      threadId: 'thread-abc',
    })

    assert.equal(result.message, 'second message')
    assert.equal(result.threadId, 'thread-abc')
    assert.equal(result.resourceId, 'default')
  })

  test('handles parts format (UIMessage)', () => {
    const result = parseAssistantUIInput({
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'hello from parts' }],
        },
      ],
    })

    assert.equal(result.message, 'hello from parts')
  })

  test('handles content array format', () => {
    const result = parseAssistantUIInput({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello from content array' }],
        },
      ],
    })

    assert.equal(result.message, 'hello from content array')
  })

  test('uses input.id as threadId fallback', () => {
    const result = parseAssistantUIInput({
      messages: [{ role: 'user', content: 'hi' }],
      id: 'id-fallback',
    })

    assert.equal(result.threadId, 'id-fallback')
  })

  test('generates UUID when no threadId or id', () => {
    const result = parseAssistantUIInput({
      messages: [{ role: 'user', content: 'hi' }],
    })

    assert.ok(result.threadId)
    assert.match(
      result.threadId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  test('uses defaults.resourceId when provided', () => {
    const result = parseAssistantUIInput(
      { messages: [{ role: 'user', content: 'hi' }] },
      { resourceId: 'my-resource' }
    )

    assert.equal(result.resourceId, 'my-resource')
  })

  test('throws on empty messages array', () => {
    assert.throws(
      () => parseAssistantUIInput({ messages: [] }),
      /non-empty messages array/
    )
  })

  test('throws on missing messages', () => {
    assert.throws(() => parseAssistantUIInput({}), /non-empty messages array/)
  })

  test('throws when no user message found', () => {
    assert.throws(
      () =>
        parseAssistantUIInput({
          messages: [{ role: 'assistant', content: 'no user here' }],
        }),
      /No user message found/
    )
  })
})
