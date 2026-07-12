import { describe, test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { TanstackAIAgentRunner } from './tanstack-ai-agent-runner.js'

type SSEChunk = Record<string, unknown>

/**
 * Spins up a mock OpenAI-compatible Chat Completions endpoint so the real
 * adapter + TanStack agent loop can be exercised without a live API key.
 * Each `/chat/completions` call consumes the next scripted list of SSE deltas
 * and records the request body for assertions.
 */
let server: http.Server
let baseUrl: string
let script: SSEChunk[][] = []
let callIndex = 0
let seenRequests: Array<{ url: string | undefined; body: any }> = []
/** Per-call HTTP status override; a non-200 makes the adapter fail the stream. */
let httpStatus: (number | null)[] = []

function chunk(
  delta: Record<string, unknown>,
  finish: string | null = null,
  usage: Record<string, number> | null = null
): SSEChunk {
  const c: SSEChunk = {
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'gpt-4o-mini',
    choices: [{ index: 0, delta, finish_reason: finish }],
  }
  if (usage) c.usage = usage
  return c
}

function makeChannel() {
  const events: any[] = []
  return {
    channel: {
      channelId: 'test',
      openingData: {},
      state: 'open',
      close: () => {},
      sendBinary: () => {},
      send: (e: any) => events.push(e),
      setState: () => {},
      getState: () => ({}),
      clearState: () => {},
    } as any,
    events,
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms: ${label}`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

before(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      seenRequests.push({ url: req.url, body: JSON.parse(body || '{}') })
      const status = httpStatus[callIndex] ?? 200
      const chunks = script[callIndex] ?? script[script.length - 1] ?? []
      callIndex++
      if (status !== 200) {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'mock provider error' } }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  const port = (server.address() as AddressInfo).port
  baseUrl = `http://localhost:${port}/v1`
  process.env.OPENAI_BASE_URL = baseUrl
  process.env.OPENAI_API_KEY = 'sk-mock-dummy'
})

after(() => {
  server.close()
})

beforeEach(() => {
  script = []
  callIndex = 0
  seenRequests = []
  httpStatus = []
})

const baseParams = {
  model: 'openai/gpt-4o-mini',
  tools: [],
  maxSteps: 10,
  toolChoice: 'auto' as const,
}

describe('TanstackAIAgentRunner.stream', () => {
  test('forwards params.instructions as the leading system prompt', async () => {
    script = [
      [
        chunk({ role: 'assistant', content: '' }),
        chunk({ content: 'hi' }),
        chunk({}, 'stop', { prompt_tokens: 1, completion_tokens: 1 }),
      ],
    ]
    const { channel } = makeChannel()
    const runner = new TanstackAIAgentRunner()
    await withTimeout(
      runner.stream(
        {
          ...baseParams,
          instructions: 'You are the routing agent. Always delegate.',
          messages: [
            { id: 'u1', role: 'user', content: 'hello', createdAt: new Date() },
          ] as any,
        },
        channel
      ),
      10_000,
      'instructions'
    )

    const sent = seenRequests[0]?.body?.messages
    assert.deepEqual(sent[0], {
      role: 'system',
      content: 'You are the routing agent. Always delegate.',
    })
  })

  test('throws when the provider stream errors, rather than completing', async () => {
    // A non-200 from the completions endpoint surfaces as a RUN_ERROR in the
    // agent loop. The runner must throw (so core marks the run failed and
    // fires onError) instead of returning finishReason 'error' — this is what
    // keeps it interchangeable with the vercel runner on the error path.
    httpStatus = [400, 400, 400, 400]
    script = [[]]
    const { channel } = makeChannel()
    const runner = new TanstackAIAgentRunner()
    await assert.rejects(
      withTimeout(
        runner.stream(
          {
            ...baseParams,
            instructions: 'x',
            messages: [
              {
                id: 'u1',
                role: 'user',
                content: 'hello',
                createdAt: new Date(),
              },
            ] as any,
          },
          channel
        ),
        20_000,
        'error-throw'
      )
    )
  })

  test('streams plain text and reports finishReason stop', async () => {
    script = [
      [
        chunk({ role: 'assistant', content: '' }),
        chunk({ content: 'Hello there' }),
        chunk({}, 'stop', { prompt_tokens: 5, completion_tokens: 2 }),
      ],
    ]
    const { channel, events } = makeChannel()
    const runner = new TanstackAIAgentRunner()
    const result = await withTimeout(
      runner.stream(
        {
          ...baseParams,
          instructions: 'You are helpful.',
          messages: [
            { id: 'u1', role: 'user', content: 'hi', createdAt: new Date() },
          ] as any,
        },
        channel
      ),
      10_000,
      'plain text'
    )

    assert.equal(result.text, 'Hello there')
    assert.equal(result.finishReason, 'stop')
    assert.equal(result.toolCalls.length, 0)
    assert.equal(
      events
        .filter((e) => e.type === 'text-delta')
        .map((e) => e.text)
        .join(''),
      'Hello there'
    )
  })

  test('executes non-approval tools and returns call + result', async () => {
    let executed = 0
    const listTodos = {
      name: 'todos__listTodos',
      description: 'List todos',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        executed++
        return [{ id: '1', title: 'Buy groceries' }]
      },
    }
    script = [
      [
        chunk({
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'todos__listTodos', arguments: '' },
            },
          ],
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
        chunk({}, 'tool_calls', { prompt_tokens: 10, completion_tokens: 3 }),
      ],
    ]
    const { channel } = makeChannel()
    const runner = new TanstackAIAgentRunner()
    const result = await withTimeout(
      runner.stream(
        {
          ...baseParams,
          instructions: 'You manage todos.',
          tools: [listTodos] as any,
          messages: [
            {
              id: 'u1',
              role: 'user',
              content: 'list todos',
              createdAt: new Date(),
            },
          ] as any,
        },
        channel
      ),
      10_000,
      'tool call'
    )

    assert.equal(executed, 1)
    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].toolName, 'todos__listTodos')
    assert.equal(result.toolResults.length, 1)
    assert.equal(result.finishReason, 'tool-calls')
  })

  test('emits the usage event after the tool-result event', async () => {
    const listTodos = {
      name: 'todos__listTodos',
      description: 'List todos',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => [{ id: '1', title: 'Buy groceries' }],
    }
    script = [
      [
        chunk({
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'todos__listTodos', arguments: '' },
            },
          ],
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
        chunk({}, 'tool_calls', { prompt_tokens: 10, completion_tokens: 3 }),
      ],
    ]
    const { channel, events } = makeChannel()
    const runner = new TanstackAIAgentRunner()
    await withTimeout(
      runner.stream(
        {
          ...baseParams,
          instructions: 'You manage todos.',
          tools: [listTodos] as any,
          messages: [
            {
              id: 'u1',
              role: 'user',
              content: 'list todos',
              createdAt: new Date(),
            },
          ] as any,
        },
        channel
      ),
      10_000,
      'usage order'
    )

    const types = events.map((e) => e.type)
    const toolResultIndex = types.indexOf('tool-result')
    const usageIndex = types.indexOf('usage')
    assert.notEqual(toolResultIndex, -1, 'tool-result must be emitted')
    assert.notEqual(usageIndex, -1, 'usage must be emitted')
    assert.ok(
      toolResultIndex < usageIndex,
      `usage (idx ${usageIndex}) must follow tool-result (idx ${toolResultIndex}); got order ${types.join(',')}`
    )
  })

  test('does not execute approval-required tools and signals tool-calls', async () => {
    let executed = 0
    const addTodo = {
      name: 'todos__addTodo',
      description: 'Add a todo',
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
      },
      needsApproval: true,
      execute: async () => {
        executed++
        return { id: '99' }
      },
    }
    script = [
      [
        chunk({
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_2',
              type: 'function',
              function: { name: 'todos__addTodo', arguments: '' },
            },
          ],
        }),
        chunk({
          tool_calls: [
            { index: 0, function: { arguments: '{"title":"Write tests"}' } },
          ],
        }),
        chunk({}, 'tool_calls', { prompt_tokens: 12, completion_tokens: 4 }),
      ],
    ]
    const { channel } = makeChannel()
    const runner = new TanstackAIAgentRunner()
    const result = await withTimeout(
      runner.stream(
        {
          ...baseParams,
          instructions: 'You manage todos.',
          tools: [addTodo] as any,
          messages: [
            {
              id: 'u1',
              role: 'user',
              content: 'add a todo',
              createdAt: new Date(),
            },
          ] as any,
        },
        channel
      ),
      10_000,
      'approval'
    )

    assert.equal(executed, 0)
    assert.equal(result.toolCalls.length, 1)
    assert.equal(result.toolCalls[0].toolName, 'todos__addTodo')
    assert.deepEqual(result.toolCalls[0].args, { title: 'Write tests' })
    assert.equal(result.toolResults.length, 0)
    assert.equal(result.finishReason, 'tool-calls')
  })

  test('round-trips tool results into a valid second request', async () => {
    const listTodos = {
      name: 'todos__listTodos',
      description: 'List todos',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => [{ id: '1', title: 'Buy groceries' }],
    }
    script = [
      [
        chunk({
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'todos__listTodos', arguments: '' },
            },
          ],
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
        chunk({}, 'tool_calls', { prompt_tokens: 10, completion_tokens: 3 }),
      ],
      [
        chunk({ role: 'assistant', content: '' }),
        chunk({ content: 'You have: Buy groceries' }),
        chunk({}, 'stop', { prompt_tokens: 20, completion_tokens: 5 }),
      ],
    ]
    const runner = new TanstackAIAgentRunner()
    const messages: any[] = [
      { id: 'u1', role: 'user', content: 'list todos', createdAt: new Date() },
    ]
    const params = {
      ...baseParams,
      instructions: 'You manage todos.',
      tools: [listTodos] as any,
    }

    const step0 = await withTimeout(
      runner.stream({ ...params, messages }, makeChannel().channel),
      10_000,
      'step0'
    )
    // Mirror core's appendStepMessages so step 1 sees the tool round-trip.
    messages.push({
      id: 'a1',
      role: 'assistant',
      content: step0.text || undefined,
      toolCalls: step0.toolCalls.map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        args: tc.args,
      })),
      createdAt: new Date(),
    })
    messages.push({
      id: 't1',
      role: 'tool',
      toolResults: step0.toolResults.map((tr) => ({
        id: tr.toolCallId,
        name: tr.toolName,
        result:
          typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
      })),
      createdAt: new Date(),
    })

    const step1 = await withTimeout(
      runner.stream({ ...params, messages }, makeChannel().channel),
      10_000,
      'step1'
    )

    assert.equal(step1.text, 'You have: Buy groceries')
    assert.equal(step1.finishReason, 'stop')
    assert.equal(step1.toolCalls.length, 0)

    const secondCall = seenRequests[1].body.messages
    assert.deepEqual(secondCall[2], {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'todos__listTodos', arguments: '{}' },
        },
      ],
    })
    assert.deepEqual(secondCall[3], {
      role: 'tool',
      tool_call_id: 'call_1',
      content: '[{"id":"1","title":"Buy groceries"}]',
    })
  })
})
