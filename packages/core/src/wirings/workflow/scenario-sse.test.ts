import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { readScenarioSseEvents } from './scenario-sse.js'

const sse = (text: string) =>
  new Response(text, { headers: { 'content-type': 'text/event-stream' } })

describe('readScenarioSseEvents', () => {
  test('reads one event per frame', async () => {
    const events = await readScenarioSseEvents<{ status: string }>(
      sse('data: {"status":"running"}\n\ndata: {"status":"completed"}\n\n')
    )

    assert.deepEqual(events, [{ status: 'running' }, { status: 'completed' }])
  })

  test('joins a frame whose data is split across lines', async () => {
    // SSE lets a producer break one payload over several `data:` lines; a
    // parser reading line-by-line sees two fragments of invalid JSON instead.
    const events = await readScenarioSseEvents<{ status: string }>(
      sse('data: {"status":\ndata: "running"}\n\n')
    )

    assert.deepEqual(events, [{ status: 'running' }])
  })

  test('accepts a frame with no space after the colon', async () => {
    const events = await readScenarioSseEvents<{ ok: boolean }>(
      sse('data:{"ok":true}\n\n')
    )

    assert.deepEqual(events, [{ ok: true }])
  })

  test('skips the terminator, comments and keep-alives', async () => {
    const events = await readScenarioSseEvents(
      sse(': keep-alive\n\ndata: [DONE]\n\nevent: ping\n\n\n\n')
    )

    assert.deepEqual(events, [])
  })

  test('ignores a frame that is not JSON rather than throwing', async () => {
    const events = await readScenarioSseEvents<{ ok: boolean }>(
      sse('data: not json\n\ndata: {"ok":true}\n\n')
    )

    assert.deepEqual(events, [{ ok: true }])
  })

  test('reads a final frame the producer left unterminated', async () => {
    const events = await readScenarioSseEvents<{ ok: boolean }>(
      sse('data: {"ok":true}')
    )

    assert.deepEqual(events, [{ ok: true }])
  })

  test('answers with nothing when there was no body at all', async () => {
    const events = await readScenarioSseEvents(
      new Response(null, { status: 204 })
    )

    assert.deepEqual(events, [])
  })
})
