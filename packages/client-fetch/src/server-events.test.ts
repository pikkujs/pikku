import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  CorePikkuFetch,
  PikkuAgentStreamError,
  PikkuFetchError,
  readServerEvents,
  type PikkuAgentEvent,
} from './index.js'

const encoder = new TextEncoder()

/** A body that delivers exactly these chunks, so a test controls where the network splits. */
const bodyOf = (chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`

const collect = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const event of events) out.push(event)
  return out
}

/** A client whose fetch answers every request with these chunks, recording the request. */
const clientReplying = (
  chunks: string[],
  init: ResponseInit = {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  }
) => {
  const seen: { url?: string; init?: RequestInit } = {}
  const client = new CorePikkuFetch({
    serverUrl: 'https://api.test',
    fetch: (async (url: string, requestInit: RequestInit) => {
      seen.url = url
      seen.init = requestInit
      return new Response(bodyOf(chunks), init)
    }) as typeof fetch,
  })
  return { client, seen }
}

const RUN_STARTED = { type: 'RUN_STARTED', threadId: 't1', runId: 'r1' }
const RUN_FINISHED = { type: 'RUN_FINISHED', threadId: 't1', runId: 'r1' }
const delta = (text: string) => ({
  type: 'TEXT_MESSAGE_CONTENT',
  messageId: 'm1',
  delta: text,
})

describe('readServerEvents', () => {
  test('yields each data frame in order', async () => {
    const events = await collect(
      readServerEvents(bodyOf([frame(delta('Hel')) + frame(delta('lo'))]))
    )
    assert.deepEqual(events, [delta('Hel'), delta('lo')])
  })

  test('holds a frame split mid-line across chunks until it is complete', async () => {
    const whole = frame(delta('split me'))
    const events = await collect(
      readServerEvents(
        bodyOf([whole.slice(0, 9), whole.slice(9, 30), whole.slice(30)])
      )
    )
    assert.deepEqual(events, [delta('split me')])
  })

  test('reads a final frame that has no blank-line terminator', async () => {
    const events = await collect(
      readServerEvents(bodyOf([`data: ${JSON.stringify(RUN_FINISHED)}`]))
    )
    assert.deepEqual(events, [RUN_FINISHED])
  })

  test('reads CRLF separators, including a CRLF split across chunks', async () => {
    const crlf = (e: unknown) => `data: ${JSON.stringify(e)}\r\n\r\n`
    const events = await collect(
      readServerEvents(
        bodyOf([crlf(delta('a')) + crlf(delta('b')).slice(0, -1), '\n'])
      )
    )
    assert.deepEqual(events, [delta('a'), delta('b')])
  })

  test('throws on a malformed frame by default, skips it when asked', async () => {
    await assert.rejects(
      collect(readServerEvents(bodyOf(['data: {not json\n\n']))),
      /Malformed server event/
    )
    const skipped = await collect(
      readServerEvents(
        bodyOf(['data: {not json\n\n', frame(delta('ok'))]),
        'skip'
      )
    )
    assert.deepEqual(skipped, [delta('ok')])
  })
})

describe('CorePikkuFetch.postStream', () => {
  test('keeps caller headers given as a Headers object or tuples', async () => {
    for (const headers of [
      new Headers({ Authorization: 'Bearer t' }),
      [['Authorization', 'Bearer t']] as [string, string][],
    ]) {
      const { client, seen } = clientReplying([frame(RUN_FINISHED)])
      await collect(client.postStream('/s', {}, { headers }))
      const sent = new Headers(seen.init?.headers as HeadersInit)
      assert.equal(sent.get('authorization'), 'Bearer t')
      assert.equal(sent.get('accept'), 'text/event-stream')
    }
  })

  test('stops at an abort even when the chunk holds more frames', async () => {
    const { client } = clientReplying([frame(RUN_STARTED) + frame(RUN_FINISHED)])
    const controller = new AbortController()
    const seen: unknown[] = []
    await assert.rejects(async () => {
      for await (const event of client.postStream('/s', {}, {
        signal: controller.signal,
      })) {
        seen.push(event)
        controller.abort()
      }
    })
    assert.deepEqual(seen, [RUN_STARTED])
  })
})

describe('CorePikkuFetch.agentStream', () => {
  test('POSTs the input as JSON and asks for an event stream', async () => {
    const { client, seen } = clientReplying([
      frame(RUN_STARTED),
      frame(RUN_FINISHED),
    ])
    await collect(
      client.agentStream('/rpc/agent/helper/stream', {
        message: 'hi',
        threadId: 't1',
        resourceId: 'r',
      })
    )
    assert.equal(seen.url, 'https://api.test/rpc/agent/helper/stream')
    assert.equal(seen.init?.method, 'POST')
    const headers = seen.init?.headers as Record<string, string>
    assert.equal(headers.accept, 'text/event-stream')
    assert.deepEqual(JSON.parse(String(seen.init?.body)), {
      message: 'hi',
      threadId: 't1',
      resourceId: 'r',
    })
  })

  test('yields text deltas and ends after RUN_FINISHED', async () => {
    const { client } = clientReplying([
      frame(RUN_STARTED),
      frame({ type: 'TEXT_MESSAGE_START', messageId: 'm1' }),
      frame(delta('Hi ')),
      frame(delta('there')),
      frame({ type: 'TEXT_MESSAGE_END', messageId: 'm1' }),
      frame({
        ...RUN_FINISHED,
        usage: [{ inputTokens: 3, outputTokens: 2, totalTokens: 5 }],
      }),
    ])
    const events = await collect(client.agentStream('/s', {}))
    const text = events
      .map((e) => (e.type === 'TEXT_MESSAGE_CONTENT' ? e.delta : ''))
      .join('')
    assert.equal(text, 'Hi there')
    const last = events.at(-1)
    assert.equal(last?.type, 'RUN_FINISHED')
    assert.deepEqual(last?.type === 'RUN_FINISHED' && last.usage, [
      { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    ])
  })

  test('yields an approval request as a typed pikku:approval-request event', async () => {
    const request = {
      toolCallId: 'call-1',
      toolName: 'deleteTodo',
      args: { id: 7 },
      reason: 'Deletes data',
      runId: 'r1',
    }
    const { client } = clientReplying([
      frame(RUN_STARTED),
      frame({ type: 'CUSTOM', name: 'pikku:approval-request', value: request }),
      frame(RUN_FINISHED),
    ])
    const approvals = (await collect(client.agentStream('/s', {}))).flatMap(
      (e: PikkuAgentEvent) =>
        e.type === 'CUSTOM' && e.name === 'pikku:approval-request'
          ? [e.value]
          : []
    )
    assert.deepEqual(approvals, [request])
  })

  test('a RUN_ERROR frame rejects with the server message', async () => {
    const { client } = clientReplying([
      frame(RUN_STARTED),
      frame(delta('partial')),
      frame({ type: 'RUN_ERROR', message: 'Model refused', code: 'E_MODEL' }),
    ])
    const seen: string[] = []
    await assert.rejects(
      (async () => {
        for await (const event of client.agentStream('/s', {})) {
          seen.push(event.type)
        }
      })(),
      (err: unknown) =>
        err instanceof PikkuAgentStreamError &&
        err.message === 'Model refused' &&
        err.code === 'E_MODEL'
    )
    assert.deepEqual(seen, ['RUN_STARTED', 'TEXT_MESSAGE_CONTENT'])
  })

  test('a stream that ends before RUN_FINISHED rejects', async () => {
    const { client } = clientReplying([frame(RUN_STARTED), frame(delta('cut'))])
    await assert.rejects(
      collect(client.agentStream('/s', {})),
      /ended before RUN_FINISHED/
    )
  })

  test('an error status rejects with a PikkuFetchError before any event', async () => {
    const { client } = clientReplying(
      [JSON.stringify({ message: 'Forbidden' })],
      { status: 403, headers: { 'content-type': 'application/json' } }
    )
    await assert.rejects(
      collect(client.agentStream('/s', {})),
      (err: unknown) => err instanceof PikkuFetchError
    )
  })

  test('aborting the signal stops the stream mid-run', async () => {
    const controller = new AbortController()
    const client = new CorePikkuFetch({
      serverUrl: 'https://api.test',
      fetch: (async (_url: string, init: RequestInit) => {
        // A body that never ends on its own: only the abort can stop it.
        const body = new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(encoder.encode(frame(RUN_STARTED)))
            init.signal?.addEventListener('abort', () =>
              stream.error(init.signal?.reason)
            )
          },
        })
        return new Response(body, { status: 200 })
      }) as typeof fetch,
    })
    const seen: string[] = []
    await assert.rejects(
      (async () => {
        for await (const event of client.agentStream(
          '/s',
          {},
          { signal: controller.signal }
        )) {
          seen.push(event.type)
          controller.abort()
        }
      })(),
      (err: unknown) => (err as Error).name === 'AbortError'
    )
    assert.deepEqual(seen, ['RUN_STARTED'])
  })
})
