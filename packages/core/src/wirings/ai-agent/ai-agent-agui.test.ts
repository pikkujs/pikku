import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { wrapChannelWithAGUI } from './ai-agent-agui.js'
import type { AIStreamChannel, AIStreamEvent } from './ai-agent.types.js'

function makeChannel(): { channel: AIStreamChannel; events: unknown[] } {
  const events: unknown[] = []
  const channel: AIStreamChannel = {
    channelId: 'test-id',
    openingData: null,
    state: 'open',
    setState: () => {},
    getState: () => undefined as any,
    clearState: () => {},
    sendBinary: () => {},
    close: () => {},
    send: (e) => events.push(e),
  }
  return { channel, events }
}

function types(events: unknown[]): string[] {
  return (events as any[]).map((e) => e.type)
}

function find<T = any>(
  events: unknown[],
  type: string,
  name?: string
): T | undefined {
  return (events as any[]).find(
    (e) => e.type === type && (name === undefined || e.name === name)
  ) as T
}

describe('wrapChannelWithAGUI — text streaming', () => {
  it('sends TEXT_MESSAGE_START only once for consecutive text-deltas', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'a' } as AIStreamEvent)
    wrapped.send({ type: 'text-delta', text: 'b' } as AIStreamEvent)
    wrapped.send({ type: 'text-delta', text: 'c' } as AIStreamEvent)

    assert.equal(
      events.filter((e: any) => e.type === 'TEXT_MESSAGE_START').length,
      1
    )
    assert.equal(
      events.filter((e: any) => e.type === 'TEXT_MESSAGE_CONTENT').length,
      3
    )
  })

  it('uses the same messageId for START, all CONTENTs, and END', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'hello' } as AIStreamEvent)
    wrapped.send({ type: 'text-delta', text: ' world' } as AIStreamEvent)
    wrapped.send({ type: 'done' } as AIStreamEvent)

    const start = find(events, 'TEXT_MESSAGE_START')
    const end = find(events, 'TEXT_MESSAGE_END')
    const contents = (events as any[]).filter(
      (e) => e.type === 'TEXT_MESSAGE_CONTENT'
    )

    assert.ok(start)
    assert.ok(end)
    assert.equal(end.messageId, start.messageId)
    for (const c of contents) {
      assert.equal(c.messageId, start.messageId)
    }
  })

  it('closes open text message when done arrives', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'hi' } as AIStreamEvent)
    wrapped.send({ type: 'done' } as AIStreamEvent)

    assert.ok(find(events, 'TEXT_MESSAGE_END'))
  })

  it('closes open text message when error arrives', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'partial' } as AIStreamEvent)
    wrapped.send({ type: 'error', message: 'oops' } as AIStreamEvent)

    const t = types(events)
    assert.ok(t.indexOf('TEXT_MESSAGE_END') < t.indexOf('RUN_ERROR'))
  })

  it('does not emit TEXT_MESSAGE_END when no text was sent', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'done' } as AIStreamEvent)

    assert.equal(
      events.filter((e: any) => e.type === 'TEXT_MESSAGE_END').length,
      0
    )
  })
})

describe('wrapChannelWithAGUI — reasoning streaming', () => {
  it('sends THINKING_TEXT_MESSAGE_START only once for consecutive reasoning-deltas', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'reasoning-delta', text: 'step 1' } as AIStreamEvent)
    wrapped.send({ type: 'reasoning-delta', text: 'step 2' } as AIStreamEvent)

    assert.equal(
      events.filter((e: any) => e.type === 'THINKING_TEXT_MESSAGE_START')
        .length,
      1
    )
    assert.equal(
      events.filter((e: any) => e.type === 'THINKING_TEXT_MESSAGE_CONTENT')
        .length,
      2
    )
  })

  it('closes thinking message and opens text message when switching', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'reasoning-delta', text: 'thinking' } as AIStreamEvent)
    wrapped.send({ type: 'text-delta', text: 'answer' } as AIStreamEvent)

    const t = types(events)
    assert.ok(t.includes('THINKING_TEXT_MESSAGE_END'))
    assert.ok(
      t.indexOf('THINKING_TEXT_MESSAGE_END') < t.indexOf('TEXT_MESSAGE_START')
    )
  })

  it('closes thinking message before tool-call', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'reasoning-delta',
      text: 'reasoning',
    } as AIStreamEvent)
    wrapped.send({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'fn',
      args: {},
    } as AIStreamEvent)

    const t = types(events)
    assert.ok(
      t.indexOf('THINKING_TEXT_MESSAGE_END') < t.indexOf('TOOL_CALL_START')
    )
  })

  it('uses consistent messageId across THINKING START, CONTENT, END', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'reasoning-delta', text: 'reason' } as AIStreamEvent)
    wrapped.send({ type: 'done' } as AIStreamEvent)

    const start = find(events, 'THINKING_TEXT_MESSAGE_START')
    const end = find(events, 'THINKING_TEXT_MESSAGE_END')
    const content = find(events, 'THINKING_TEXT_MESSAGE_CONTENT')

    assert.ok(start && end && content)
    assert.equal(content.messageId, start.messageId)
    assert.equal(end.messageId, start.messageId)
  })
})

describe('wrapChannelWithAGUI — tool calls', () => {
  it('closes text message before TOOL_CALL_START', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'preamble' } as AIStreamEvent)
    wrapped.send({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'myTool',
      args: { x: 1 },
    } as AIStreamEvent)

    const t = types(events)
    assert.ok(t.indexOf('TEXT_MESSAGE_END') < t.indexOf('TOOL_CALL_START'))
  })

  it('emits TOOL_CALL_START immediately before TOOL_CALL_END', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'search',
      args: { q: 'hi' },
    } as AIStreamEvent)

    const t = types(events)
    const startIdx = t.indexOf('TOOL_CALL_START')
    const endIdx = t.indexOf('TOOL_CALL_END')
    assert.ok(startIdx !== -1 && endIdx !== -1)
    assert.equal(endIdx, startIdx + 1)
  })

  it('propagates toolCallId and toolCallName to both START and END', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'tool-call',
      toolCallId: 'abc',
      toolName: 'myFunc',
      args: { n: 42 },
    } as AIStreamEvent)

    const start = find(events, 'TOOL_CALL_START')
    const end = find(events, 'TOOL_CALL_END')
    assert.equal(start.toolCallId, 'abc')
    assert.equal(start.toolCallName, 'myFunc')
    assert.equal(end.toolCallId, 'abc')
    assert.equal(end.toolCallName, 'myFunc')
    assert.deepEqual(end.input, { n: 42 })
  })

  it('handles multiple tool calls in sequence', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'fn1',
      args: {},
    } as AIStreamEvent)
    wrapped.send({
      type: 'tool-call',
      toolCallId: 'tc2',
      toolName: 'fn2',
      args: {},
    } as AIStreamEvent)

    const starts = (events as any[]).filter((e) => e.type === 'TOOL_CALL_START')
    const ends = (events as any[]).filter((e) => e.type === 'TOOL_CALL_END')
    assert.equal(starts.length, 2)
    assert.equal(ends.length, 2)
    assert.equal(starts[0].toolCallId, 'tc1')
    assert.equal(starts[1].toolCallId, 'tc2')
  })

  it('converts object tool-result to JSON string in content', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'tool-result',
      toolCallId: 'tc1',
      toolName: 'fn',
      result: { ok: true },
    } as AIStreamEvent)

    const r = find(events, 'TOOL_CALL_RESULT')
    assert.equal(r.content, '{"ok":true}')
    assert.equal(r.role, 'tool')
  })

  it('passes string tool-result through unchanged', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'tool-result',
      toolCallId: 'tc1',
      toolName: 'fn',
      result: 'plain text',
    } as AIStreamEvent)

    const r = find(events, 'TOOL_CALL_RESULT')
    assert.equal(r.content, 'plain text')
  })
})

describe('wrapChannelWithAGUI — run lifecycle', () => {
  it('emits RUN_FINISHED with full usage fields', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'usage',
      tokens: { input: 100, output: 50 },
      model: 'claude-3-5',
    } as AIStreamEvent)

    const f = find(events, 'RUN_FINISHED')
    assert.ok(f)
    assert.equal(f.model, 'claude-3-5')
    assert.equal(f.usage.promptTokens, 100)
    assert.equal(f.usage.completionTokens, 50)
    assert.equal(f.usage.totalTokens, 150)
  })

  it('emits RUN_FINISHED exactly once when both usage and done arrive', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'usage',
      tokens: { input: 1, output: 1 },
      model: 'm',
    } as AIStreamEvent)
    wrapped.send({ type: 'done' } as AIStreamEvent)

    assert.equal(events.filter((e: any) => e.type === 'RUN_FINISHED').length, 1)
  })

  it('emits RUN_FINISHED on done when there was no usage event', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'done' } as AIStreamEvent)

    assert.ok(find(events, 'RUN_FINISHED'))
  })

  it('usage event closes any open text message before RUN_FINISHED', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'hi' } as AIStreamEvent)
    wrapped.send({
      type: 'usage',
      tokens: { input: 1, output: 1 },
      model: 'm',
    } as AIStreamEvent)

    const t = types(events)
    assert.ok(t.indexOf('TEXT_MESSAGE_END') < t.indexOf('RUN_FINISHED'))
  })

  it('emits RUN_ERROR and closes open text on error', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'partial' } as AIStreamEvent)
    wrapped.send({ type: 'error', message: 'network timeout' } as AIStreamEvent)

    const err = find(events, 'RUN_ERROR')
    assert.ok(err)
    assert.equal(err.message, 'network timeout')
    const t = types(events)
    assert.ok(t.indexOf('TEXT_MESSAGE_END') < t.indexOf('RUN_ERROR'))
  })

  it('emits RUN_ERROR and closes open thinking message on error', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'reasoning-delta', text: 'thinking' } as AIStreamEvent)
    wrapped.send({ type: 'error', message: 'fail' } as AIStreamEvent)

    const t = types(events)
    assert.ok(t.indexOf('THINKING_TEXT_MESSAGE_END') < t.indexOf('RUN_ERROR'))
  })
})

describe('wrapChannelWithAGUI — step events', () => {
  it('emits STEP_STARTED for step-start', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'step-start',
      stepNumber: 1,
      agent: 'researcher',
    } as AIStreamEvent)

    const s = find(events, 'STEP_STARTED')
    assert.ok(s)
    assert.equal(s.stepName, 'researcher')
  })

  it('emits STEP_STARTED with undefined stepName when agent is absent', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'step-start', stepNumber: 1 } as AIStreamEvent)

    const s = find(events, 'STEP_STARTED')
    assert.ok(s)
    assert.equal(s.stepName, undefined)
  })
})

describe('wrapChannelWithAGUI — Pikku CUSTOM events', () => {
  it('emits CUSTOM pikku:approval-request with all fields', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'approval-request',
      toolCallId: 'tc1',
      toolName: 'deleteUser',
      args: { userId: 99 },
      reason: 'irreversible action',
      agent: 'admin-agent',
      session: 'sess-1',
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:approval-request')
    assert.ok(c)
    assert.equal(c.value.toolCallId, 'tc1')
    assert.equal(c.value.toolName, 'deleteUser')
    assert.deepEqual(c.value.args, { userId: 99 })
    assert.equal(c.value.reason, 'irreversible action')
    assert.equal(c.value.agent, 'admin-agent')
    assert.equal(c.value.session, 'sess-1')
  })

  it('closes open text message before emitting approval-request', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'text-delta', text: 'about to ask' } as AIStreamEvent)
    wrapped.send({
      type: 'approval-request',
      toolCallId: 'tc1',
      toolName: 'fn',
      args: {},
    } as AIStreamEvent)

    const t = types(events)
    assert.ok(t.indexOf('TEXT_MESSAGE_END') < t.indexOf('CUSTOM'))
  })

  it('emits CUSTOM pikku:credential-request with all fields', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'credential-request',
      toolCallId: 'tc2',
      toolName: 'githubSearch',
      args: { repo: 'pikku' },
      credentialName: 'github-token',
      credentialType: 'oauth2',
      connectUrl: 'https://github.com/oauth',
      runId: 'run-abc',
      agent: 'dev-agent',
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:credential-request')
    assert.ok(c)
    assert.equal(c.value.credentialName, 'github-token')
    assert.equal(c.value.credentialType, 'oauth2')
    assert.equal(c.value.connectUrl, 'https://github.com/oauth')
    assert.equal(c.value.runId, 'run-abc')
    assert.equal(c.value.toolCallId, 'tc2')
  })

  it('emits CUSTOM pikku:generative-ui', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'generative-ui',
      spec: { component: 'Chart', props: { data: [1, 2] } },
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:generative-ui')
    assert.ok(c)
    assert.deepEqual(c.value.spec, {
      component: 'Chart',
      props: { data: [1, 2] },
    })
  })

  it('emits CUSTOM pikku:data', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'data',
      name: 'search-results',
      data: [{ title: 'foo' }],
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:data')
    assert.ok(c)
    assert.equal(c.value.name, 'search-results')
    assert.deepEqual(c.value.data, [{ title: 'foo' }])
  })

  it('emits CUSTOM pikku:workflow-created', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'workflow-created',
      workflowName: 'myFlow',
      graph: { nodes: [] },
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:workflow-created')
    assert.ok(c)
    assert.equal(c.value.workflowName, 'myFlow')
    assert.deepEqual(c.value.graph, { nodes: [] })
  })

  it('emits CUSTOM pikku:agent-call', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'agent-call',
      agentName: 'sub-agent',
      session: 'sess-2',
      input: { query: 'hello' },
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:agent-call')
    assert.ok(c)
    assert.equal(c.value.agentName, 'sub-agent')
    assert.equal(c.value.session, 'sess-2')
    assert.deepEqual(c.value.input, { query: 'hello' })
  })

  it('emits CUSTOM pikku:agent-result', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'agent-result',
      agentName: 'sub-agent',
      session: 'sess-2',
      result: 'done',
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:agent-result')
    assert.ok(c)
    assert.equal(c.value.agentName, 'sub-agent')
    assert.equal(c.value.result, 'done')
  })

  it('emits CUSTOM pikku:suspended', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'suspended',
      reason: 'rpc-missing',
      missingRpcs: ['stripe.charge'],
    } as AIStreamEvent)

    const c = find(events, 'CUSTOM', 'pikku:suspended')
    assert.ok(c)
    assert.equal(c.value.reason, 'rpc-missing')
    assert.deepEqual(c.value.missingRpcs, ['stripe.charge'])
  })
})

describe('wrapChannelWithAGUI — silently dropped events', () => {
  it('drops audio-delta without emitting anything', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'audio-delta',
      data: 'base64abc',
      format: 'mp3',
    } as AIStreamEvent)

    assert.equal(events.length, 0)
  })

  it('drops audio-done without emitting anything', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({ type: 'audio-done' } as AIStreamEvent)

    assert.equal(events.length, 0)
  })
})

describe('wrapChannelWithAGUI — channel proxy', () => {
  it('exposes the inner channelId', () => {
    const { channel } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)
    assert.equal(wrapped.channelId, 'test-id')
  })

  it('delegates setState / getState / clearState to inner', () => {
    let stored: unknown
    const { channel } = makeChannel()
    channel.setState = (v) => {
      stored = v
    }
    channel.getState = () => stored as any
    channel.clearState = () => {
      stored = undefined
    }

    const wrapped = wrapChannelWithAGUI(channel)
    wrapped.setState('my-state')
    assert.equal(wrapped.getState(), 'my-state')
    wrapped.clearState()
    assert.equal(wrapped.getState(), undefined)
  })

  it('delegates sendBinary to inner', () => {
    const binaries: unknown[] = []
    const { channel } = makeChannel()
    channel.sendBinary = (d) => binaries.push(d)

    const wrapped = wrapChannelWithAGUI(channel)
    wrapped.sendBinary(new Uint8Array([1, 2, 3]))
    assert.equal(binaries.length, 1)
  })

  it('delegates close to inner', () => {
    let closed = false
    const { channel } = makeChannel()
    channel.close = () => {
      closed = true
    }

    const wrapped = wrapChannelWithAGUI(channel)
    wrapped.close()
    assert.ok(closed)
  })

  it('reflects inner state property', () => {
    const { channel } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)
    assert.equal(wrapped.state, 'open')
    channel.state = 'closed'
    assert.equal(wrapped.state, 'closed')
  })
})

describe('wrapChannelWithAGUI — realistic full turn', () => {
  it('handles think → text → tool-call → tool-result → usage → done sequence', () => {
    const { channel, events } = makeChannel()
    const wrapped = wrapChannelWithAGUI(channel)

    wrapped.send({
      type: 'reasoning-delta',
      text: 'let me search',
    } as AIStreamEvent)
    wrapped.send({
      type: 'text-delta',
      text: 'I will look that up.',
    } as AIStreamEvent)
    wrapped.send({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'search',
      args: { q: 'pikku' },
    } as AIStreamEvent)
    wrapped.send({
      type: 'tool-result',
      toolCallId: 'tc1',
      toolName: 'search',
      result: 'found it',
    } as AIStreamEvent)
    wrapped.send({
      type: 'text-delta',
      text: 'Here is what I found.',
    } as AIStreamEvent)
    wrapped.send({
      type: 'usage',
      tokens: { input: 200, output: 80 },
      model: 'gpt-4o',
    } as AIStreamEvent)
    wrapped.send({ type: 'done' } as AIStreamEvent)

    const t = types(events)
    assert.ok(t.includes('THINKING_TEXT_MESSAGE_START'))
    assert.ok(t.includes('THINKING_TEXT_MESSAGE_END'))
    assert.ok(t.includes('TEXT_MESSAGE_START'))
    assert.ok(t.includes('TEXT_MESSAGE_END'))
    assert.ok(t.includes('TOOL_CALL_START'))
    assert.ok(t.includes('TOOL_CALL_END'))
    assert.ok(t.includes('TOOL_CALL_RESULT'))
    assert.ok(t.includes('RUN_FINISHED'))
    assert.equal(t.filter((x) => x === 'RUN_FINISHED').length, 1)
    assert.equal(t.filter((x) => x === 'TEXT_MESSAGE_START').length, 2)
  })
})
