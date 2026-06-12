import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pikku } from './http.js'

type TestStreamEvent =
  | { type: 'scenario-start'; id: string; name: string; uri: string }
  | {
      type: 'step'
      scenarioId: string
      step: string
      status: string
      duration: number
      message?: string
    }
  | { type: 'scenario-done'; id: string; name: string; status: string }
  | { type: 'done'; coverage: unknown }
  | { type: 'error'; message: string }

function sseBody(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < events.length) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(events[i++])}\n\n`)
        )
      } else {
        controller.close()
      }
    },
  })
}

function mockFetch(
  events: unknown[],
  capture: { url?: string; headers?: Record<string, string> }
): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    capture.url = typeof input === 'string' ? input : input.toString()
    capture.headers = (init?.headers ?? {}) as Record<string, string>
    return new Response(sseBody(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }) as typeof fetch
}

async function collectSSE(
  events: unknown[],
  path: string,
  timeout = 5_000
): Promise<{
  received: TestStreamEvent[]
  url: string
  headers: Record<string, string>
}> {
  const capture: { url?: string; headers?: Record<string, string> } = {}
  const original = globalThis.fetch
  globalThis.fetch = mockFetch(events, capture)

  const received: TestStreamEvent[] = []

  try {
    const client = pikku({ serverUrl: 'https://example.com' })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('SSE stream timed out')),
        timeout
      )
      client.rpc.subscribeToSSE<TestStreamEvent>(
        path,
        (event) => {
          received.push(event)
          if (event.type === 'done' || event.type === 'error') {
            clearTimeout(timer)
            resolve()
          }
        },
        (err) => {
          clearTimeout(timer)
          reject(err)
        }
      )
    })
  } finally {
    globalThis.fetch = original
  }

  return { received, url: capture.url!, headers: capture.headers! }
}

const FULL_RUN_EVENTS: TestStreamEvent[] = [
  {
    type: 'scenario-start',
    id: 'tcs1',
    name: 'Create a todo',
    uri: 'features/todo.feature',
  },
  {
    type: 'step',
    scenarioId: 'tcs1',
    step: 'Given a user exists',
    status: 'PASSED',
    duration: 30,
  },
  {
    type: 'step',
    scenarioId: 'tcs1',
    step: 'When they create a todo',
    status: 'PASSED',
    duration: 15,
  },
  {
    type: 'scenario-done',
    id: 'tcs1',
    name: 'Create a todo',
    status: 'PASSED',
  },
  { type: 'done', coverage: null },
]

test('subscribeToSSE requests /function-tests/stream with Accept: text/event-stream', async () => {
  const { url, headers } = await collectSSE(
    FULL_RUN_EVENTS,
    '/function-tests/stream'
  )
  assert.ok(
    url.includes('/function-tests/stream'),
    `expected URL to include /function-tests/stream, got: ${url}`
  )
  assert.equal(headers['Accept'], 'text/event-stream')
})

test('subscribeToSSE delivers scenario-start event with correct fields', async () => {
  const { received } = await collectSSE(
    FULL_RUN_EVENTS,
    '/function-tests/stream'
  )
  const start = received.find((e) => e.type === 'scenario-start') as
    | Extract<TestStreamEvent, { type: 'scenario-start' }>
    | undefined
  assert.ok(start, 'expected a scenario-start event')
  assert.equal(start.id, 'tcs1')
  assert.equal(start.name, 'Create a todo')
  assert.equal(start.uri, 'features/todo.feature')
})

test('subscribeToSSE delivers step events in order', async () => {
  const { received } = await collectSSE(
    FULL_RUN_EVENTS,
    '/function-tests/stream'
  )
  const steps = received.filter((e) => e.type === 'step') as Extract<
    TestStreamEvent,
    { type: 'step' }
  >[]
  assert.equal(steps.length, 2)
  assert.equal(steps[0].step, 'Given a user exists')
  assert.equal(steps[0].status, 'PASSED')
  assert.equal(steps[0].duration, 30)
  assert.equal(steps[1].step, 'When they create a todo')
})

test('subscribeToSSE delivers scenario-done with final status', async () => {
  const { received } = await collectSSE(
    FULL_RUN_EVENTS,
    '/function-tests/stream'
  )
  const done = received.find((e) => e.type === 'scenario-done') as
    | Extract<TestStreamEvent, { type: 'scenario-done' }>
    | undefined
  assert.ok(done, 'expected a scenario-done event')
  assert.equal(done.name, 'Create a todo')
  assert.equal(done.status, 'PASSED')
})

test('subscribeToSSE delivers done event and stops', async () => {
  const { received } = await collectSSE(
    FULL_RUN_EVENTS,
    '/function-tests/stream'
  )
  const finish = received.find((e) => e.type === 'done') as
    | Extract<TestStreamEvent, { type: 'done' }>
    | undefined
  assert.ok(finish, 'expected a done event')
  assert.equal(finish.coverage, null)

  const afterDone = received.slice(received.indexOf(finish) + 1)
  assert.equal(afterDone.length, 0, 'no events should arrive after done')
})

test('subscribeToSSE parses events spanning multiple SSE chunks', async () => {
  const encoder = new TextEncoder()
  const rawEvents = FULL_RUN_EVENTS.slice(0, 2)
  const fullText = rawEvents
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join('')
  const mid = Math.floor(fullText.length / 2)
  const chunk1 = encoder.encode(fullText.slice(0, mid))
  const chunk2 = encoder.encode(fullText.slice(mid))
  const doneChunk = encoder.encode(
    `data: ${JSON.stringify({ type: 'done', coverage: null })}\n\n`
  )

  const capture: { url?: string; headers?: Record<string, string> } = {}
  const original = globalThis.fetch
  let i = 0
  const chunks = [chunk1, chunk2, doneChunk]
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (i < chunks.length) controller.enqueue(chunks[i++])
          else controller.close()
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    )) as typeof fetch

  const received: TestStreamEvent[] = []
  try {
    const client = pikku({ serverUrl: 'https://example.com' })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 5_000)
      client.rpc.subscribeToSSE<TestStreamEvent>(
        '/function-tests/stream',
        (event) => {
          received.push(event)
          if (event.type === 'done') {
            clearTimeout(timer)
            resolve()
          }
        },
        reject
      )
    })
  } finally {
    globalThis.fetch = original
    void capture
  }

  const start = received.find((e) => e.type === 'scenario-start')
  assert.ok(
    start,
    'scenario-start should be parsed even when split across chunks'
  )
  const step = received.find((e) => e.type === 'step')
  assert.ok(step, 'step should be parsed even when split across chunks')
})
