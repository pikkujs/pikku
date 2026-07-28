import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { describeValue, readSseEvents } from './support.js'

const sse = (text: string) =>
  new Response(text, { headers: { 'content-type': 'text/event-stream' } })

describe('describeValue', () => {
  test('quotes a string as itself', () => {
    assert.equal(describeValue('a todo'), 'a todo')
  })

  test('quotes anything else as JSON', () => {
    assert.equal(describeValue({ status: 'failed' }), '{"status":"failed"}')
    assert.equal(describeValue(['a', 'b']), '["a","b"]')
    assert.equal(describeValue(3), '3')
  })
})

describe('readSseEvents', () => {
  test('reads one event per frame', async () => {
    const events = await readSseEvents<{ status: string }>(
      sse('data: {"status":"running"}\n\ndata: {"status":"completed"}\n\n')
    )

    assert.deepEqual(events, [{ status: 'running' }, { status: 'completed' }])
  })

  test('joins a frame whose data is split across lines', async () => {
    // SSE lets a producer break one payload over several `data:` lines; a
    // parser reading line-by-line sees two fragments of invalid JSON instead.
    const events = await readSseEvents<{ status: string }>(
      sse('data: {"status":\ndata: "running"}\n\n')
    )

    assert.deepEqual(events, [{ status: 'running' }])
  })

  test('refuses to invent a payload a producer split mid-string', async () => {
    // The spec joins `data:` lines with a newline, which inside a JSON string
    // is invalid — so this frame is a producer bug, and saying so is the only
    // correct answer. Joining with '' instead would have parsed it happily into
    // `{ text: 'firstsecond' }`: a value nobody sent, asserted on as if they
    // had.
    await assert.rejects(
      () => readSseEvents(sse('data: {"text": "first\ndata: second"}\n\n')),
      /not JSON/
    )
  })

  test('reads frames a proxy normalised to CRLF', async () => {
    // A `\n\n` split reads the whole body as one frame, joins every data line
    // into invalid JSON, and answers with nothing at all.
    const events = await readSseEvents<{ status: string }>(
      sse('data: {"status":"running"}\r\n\r\ndata: {"status":"done"}\r\n\r\n')
    )

    assert.deepEqual(events, [{ status: 'running' }, { status: 'done' }])
  })

  test('accepts a frame with no space after the colon', async () => {
    const events = await readSseEvents<{ ok: boolean }>(
      sse('data:{"ok":true}\n\n')
    )

    assert.deepEqual(events, [{ ok: true }])
  })

  test('skips the terminator, comments and keep-alives', async () => {
    const events = await readSseEvents(
      sse(': keep-alive\n\ndata: [DONE]\n\nevent: ping\n\n\n\n')
    )

    assert.deepEqual(events, [])
  })

  test('throws on a data frame it cannot parse, rather than dropping it', async () => {
    await assert.rejects(
      () => readSseEvents(sse('data: not json\n\ndata: {"ok":true}\n\n')),
      /not JSON: not json/
    )
  })

  test('reads a final frame the producer left unterminated', async () => {
    const events = await readSseEvents<{ ok: boolean }>(
      sse('data: {"ok":true}')
    )

    assert.deepEqual(events, [{ ok: true }])
  })

  test('answers with nothing when there was no body at all', async () => {
    const events = await readSseEvents(new Response(null, { status: 204 }))

    assert.deepEqual(events, [])
  })
})
