import { describe, test } from 'node:test'
import assert from 'node:assert'
import { subscribeToChanges } from './changes-events.js'

const PROJECT = '11111111-1111-4111-8111-111111111111'

/** A response body the test writes SSE frames into, and can end. */
const stream = () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c
    },
  })
  const encoder = new TextEncoder()
  return {
    body,
    write: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('subscribeToChanges', () => {
  test('connects to the project topic with the bearer and wakes on each event', async () => {
    const body = stream()
    const requests: { url: string; init: RequestInit }[] = []
    const events = subscribeToChanges({
      apiUrl: 'https://api.example.test/',
      token: 'tok',
      projectId: PROJECT,
      fetch: (async (url: string, init: RequestInit) => {
        requests.push({ url, init })
        return new Response(body.body, { status: 200 })
      }) as unknown as typeof fetch,
    })
    await tick()
    assert.strictEqual(events.live, true)
    assert.strictEqual(
      requests[0]!.url,
      `https://api.example.test/events/changes%3A${PROJECT}`
    )
    assert.deepStrictEqual(requests[0]!.init.headers, {
      Accept: 'text/event-stream',
      Authorization: 'Bearer tok',
    })

    let woke = false
    const next = events.next().then(() => (woke = true))
    body.write('data: {"type":"change-filed"')
    await tick()
    assert.strictEqual(woke, false)
    body.write(',"shortId":"4"}\r\n\r\n')
    await next
    assert.strictEqual(woke, true)
    events.close()
  })

  test('an event that arrives while nobody is waiting is not lost', async () => {
    const body = stream()
    const events = subscribeToChanges({
      apiUrl: 'https://api.example.test',
      token: 'tok',
      projectId: PROJECT,
      fetch: (async () =>
        new Response(body.body, { status: 200 })) as unknown as typeof fetch,
    })
    await tick()

    body.write('data: {"type":"filed"}\n\n')
    await tick()

    let woke = false
    const next = events.next().then(() => (woke = true))
    await tick()
    assert.strictEqual(woke, true)
    await next

    let again = false
    void events.next().then(() => (again = true))
    await tick()
    assert.strictEqual(again, false, 'one event wakes one call')
    events.close()
  })

  test('a dropped stream stops counting as live, wakes the waiter, and reconnects', async () => {
    const first = stream()
    const second = stream()
    const bodies = [first, second]
    const sleeps: number[] = []
    let connects = 0
    const events = subscribeToChanges({
      apiUrl: 'https://api.example.test',
      token: 'tok',
      projectId: PROJECT,
      fetch: (async () =>
        new Response(bodies[connects++]!.body, {
          status: 200,
        })) as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    await tick()
    assert.strictEqual(events.live, true)
    const dropped = events.next()
    first.end()
    await dropped
    await tick()
    assert.strictEqual(connects, 2)
    assert.deepStrictEqual(sleeps, [1_000])
    assert.strictEqual(events.live, true)
    events.close()
  })

  test('a route fabric does not serve, or a refused session, is not retried', async () => {
    let connects = 0
    const lines: string[] = []
    const events = subscribeToChanges({
      apiUrl: 'https://api.example.test',
      token: 'tok',
      projectId: PROJECT,
      fetch: (async () => {
        connects++
        return new Response('nope', { status: 404 })
      }) as unknown as typeof fetch,
      log: (line) => lines.push(line),
    })
    await tick()
    await tick()
    assert.strictEqual(connects, 1)
    assert.strictEqual(events.live, false)
    assert.match(lines[0]!, /polling instead/)
    events.close()
  })

  test('a server error is retried with growing backoff', async () => {
    const sleeps: number[] = []
    let connects = 0
    const events = subscribeToChanges({
      apiUrl: 'https://api.example.test',
      token: 'tok',
      projectId: PROJECT,
      fetch: (async () => {
        connects++
        return new Response('down', { status: 503 })
      }) as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms)
        if (sleeps.length === 3) events.close()
      },
    })
    await tick()
    assert.deepStrictEqual(sleeps, [1_000, 2_000, 4_000])
    assert.strictEqual(connects, 3)
  })
})
