import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  convertToSDKMessages,
  convertFromSDKStep,
} from './message-converter.js'
import type { AIMessage } from '@pikku/core/ai-agent'

/**
 * `convertToSDKMessages` is the seam between Pikku's stored message shape and the
 * AI SDK's `ModelMessage`. Attachments, tool calls and tool results all cross it,
 * so a mistake here is a mistake the model sees — a dropped image, a URL sent as
 * raw text, a tool result the model can no longer match to its call.
 */
describe('convertToSDKMessages', () => {
  const msg = (m: Partial<AIMessage> & Pick<AIMessage, 'role'>): AIMessage => ({
    id: 'id',
    createdAt: new Date(),
    ...m,
  })

  test('a system message becomes string content', async () => {
    const [out] = await convertToSDKMessages([
      msg({ role: 'system', content: 'be terse' }),
    ])
    assert.deepEqual(out, { role: 'system', content: 'be terse' })
  })

  test('a plain user string passes straight through', async () => {
    const [out] = await convertToSDKMessages([
      msg({ role: 'user', content: 'hello' }),
    ])
    assert.deepEqual(out, { role: 'user', content: 'hello' })
  })

  test('a user with no content becomes an empty string, not undefined', async () => {
    const [out] = await convertToSDKMessages([msg({ role: 'user' })])
    assert.deepEqual(out, { role: 'user', content: '' })
  })

  test('an image attachment sent as data keeps the base64 payload and mediaType', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'user',
        content: [
          { type: 'image', data: 'BASE64DATA', mediaType: 'image/png' },
        ],
      }),
    ])
    assert.deepEqual((out as any).content, [
      { type: 'image', image: 'BASE64DATA', mediaType: 'image/png' },
    ])
  })

  test('an image attachment sent as url becomes a URL, not raw text', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'user',
        content: [{ type: 'image', url: 'https://ex.com/a.png' }],
      }),
    ])
    const part = (out as any).content[0]
    assert.equal(part.type, 'image')
    assert.ok(part.image instanceof URL)
    assert.equal(part.image.href, 'https://ex.com/a.png')
  })

  test('a file attachment preserves mediaType and filename', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'FILEDATA',
            mediaType: 'application/pdf',
            filename: 'report.pdf',
          },
        ],
      }),
    ])
    assert.deepEqual((out as any).content, [
      {
        type: 'file',
        data: 'FILEDATA',
        mediaType: 'application/pdf',
        filename: 'report.pdf',
      },
    ])
  })

  test('a file attachment sent as url becomes a URL in the data field', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'user',
        content: [
          {
            type: 'file',
            url: 'https://ex.com/a.pdf',
            mediaType: 'application/pdf',
          },
        ],
      }),
    ])
    const part = (out as any).content[0]
    assert.ok(part.data instanceof URL)
    assert.equal(part.data.href, 'https://ex.com/a.pdf')
  })

  test('mixed parts keep their order and unknown part types are dropped', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'user',
        content: [
          { type: 'text', text: 'look:' },
          { type: 'image', data: 'IMG', mediaType: 'image/jpeg' },
          { type: 'data', name: 'meta', data: { x: 1 } },
          { type: 'text', text: 'thanks' },
        ],
      }),
    ])
    const parts = (out as any).content
    assert.equal(parts.length, 3)
    assert.deepEqual(
      parts.map((p: any) => p.type),
      ['text', 'image', 'text']
    )
    assert.equal(parts[0].text, 'look:')
    assert.equal(parts[2].text, 'thanks')
  })

  test('an assistant string passes through', async () => {
    const [out] = await convertToSDKMessages([
      msg({ role: 'assistant', content: 'done' }),
    ])
    assert.deepEqual(out, { role: 'assistant', content: 'done' })
  })

  test('assistant array content is flattened to its joined text', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'assistant',
        content: [
          { type: 'text', text: 'part one ' },
          { type: 'text', text: 'part two' },
        ],
      }),
    ])
    assert.deepEqual(out, { role: 'assistant', content: 'part one part two' })
  })

  test('assistant tool calls become tool-call parts alongside reasoning and text', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'assistant',
        content: 'calling now',
        reasoningContent: 'because I should',
        toolCalls: [{ id: 'c1', name: 'lookup', args: { q: 'x' } }],
      }),
    ])
    assert.deepEqual((out as any).content, [
      { type: 'reasoning', text: 'because I should' },
      { type: 'text', text: 'calling now' },
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'lookup',
        input: { q: 'x' },
      },
    ])
  })

  test('a tool message maps results to tool-result parts keyed by call id', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'tool',
        toolResults: [{ id: 'c1', name: 'lookup', result: '{"found":true}' }],
      }),
    ])
    assert.deepEqual((out as any).content, [
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'lookup',
        output: { type: 'json', value: { found: true } },
      },
    ])
  })

  test('tool calls and results provided as JSON strings are parsed', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'assistant',
        toolCalls: '[{"id":"c9","name":"go","args":{"n":1}}]' as any,
      }),
    ])
    const call = (out as any).content[0]
    assert.equal(call.type, 'tool-call')
    assert.equal(call.toolCallId, 'c9')
    assert.deepEqual(call.input, { n: 1 })
  })

  test('a non-JSON tool result string is passed through verbatim', async () => {
    const [out] = await convertToSDKMessages([
      msg({
        role: 'tool',
        toolResults: [{ id: 'c1', name: 'lookup', result: 'plain text' }],
      }),
    ])
    assert.equal((out as any).content[0].output.value, 'plain text')
  })
})

/**
 * `convertFromSDKStep` is how a finished SDK step becomes the step shape Pikku
 * persists and reports. It has to survive an SDK that omits usage or tool calls
 * entirely, and it must pair each tool call with its own result.
 */
describe('convertFromSDKStep', () => {
  test('defaults usage to zero when the SDK omits it', () => {
    const step = convertFromSDKStep({})
    assert.deepEqual(step.usage, { inputTokens: 0, outputTokens: 0 })
    assert.equal(step.toolCalls, undefined)
  })

  test('maps usage and pairs each tool call with its matching result', () => {
    const step = convertFromSDKStep({
      usage: { inputTokens: 12, outputTokens: 3 },
      toolCalls: [
        { toolCallId: 'a', toolName: 'first', input: { x: 1 } },
        { toolCallId: 'b', toolName: 'second', input: { y: 2 } },
      ],
      toolResults: [
        { toolCallId: 'b', output: { ok: 'B' } },
        { toolCallId: 'a', output: { ok: 'A' } },
      ],
    })
    assert.deepEqual(step.usage, { inputTokens: 12, outputTokens: 3 })
    assert.equal(step.toolCalls!.length, 2)
    assert.deepEqual(step.toolCalls![0], {
      name: 'first',
      args: { x: 1 },
      result: JSON.stringify({ ok: 'A' }),
    })
    assert.deepEqual(step.toolCalls![1], {
      name: 'second',
      args: { y: 2 },
      result: JSON.stringify({ ok: 'B' }),
    })
  })

  test('a tool call with no matching result serializes an empty string', () => {
    const step = convertFromSDKStep({
      toolCalls: [{ toolCallId: 'a', toolName: 'lonely', input: {} }],
      toolResults: [],
    })
    assert.equal(step.toolCalls![0].result, JSON.stringify(''))
  })
})
