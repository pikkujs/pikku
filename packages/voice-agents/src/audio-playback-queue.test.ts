import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { AudioPlaybackQueue } from './audio-playback-queue.js'

/**
 * A stand-in for the browser's `AudioContext`, with two properties the real one
 * has and a naive fake would not: decoding takes time, and how much time
 * depends on the clip. That is the whole subject of these tests — sentences are
 * enqueued without being awaited so their decodes overlap, and a fake that
 * resolves instantly or uniformly cannot tell a queue that preserves order from
 * one that plays whatever finished first.
 *
 * Playback is likewise not instant: `start()` schedules `onended` a tick later,
 * so a chunk that jumps the queue is observable as an out-of-order `played`.
 */
const fakeContext = (decodeMs: (clip: number) => number) => {
  const played: string[] = []
  let time = 0
  const ctx = {
    state: 'running' as string,
    get currentTime() {
      return time
    },
    decodeAudioData: (audio: ArrayBuffer) => {
      const label = (audio as any).label as string
      const size = new Uint8Array(audio)[0]!
      return new Promise((resolve) =>
        setTimeout(() => resolve({ duration: 1, label } as any), decodeMs(size))
      )
    },
    createBufferSource: () => {
      const source: any = {
        buffer: null,
        connect: () => {},
        onended: null as null | (() => void),
        start: () => {
          setTimeout(() => {
            time += 1
            played.push(source.buffer.label)
            source.onended?.()
          }, 1)
        },
        stop: () => {},
      }
      return source
    },
    suspend: async () => {
      ctx.state = 'suspended'
    },
    resume: async () => {
      ctx.state = 'running'
    },
    close: async () => {},
  }
  return { ctx, played }
}

/** Labels the audio so playback order is checkable. `n` sizes the clip. */
const clip = (label: string, n: number): ArrayBuffer => {
  const bytes = new Uint8Array([n])
  Object.defineProperty(bytes.buffer, 'label', { value: label })
  return bytes.buffer
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 60))

describe('AudioPlaybackQueue', () => {
  test('speaks sentences in the order enqueued, not the order decoded', async () => {
    // The regression: `enqueue` used to await the decode before taking its
    // place in the queue. Decode time scales with clip length, so a short
    // second sentence overtook a long first one and the reply played back
    // rearranged — which sounds like a plausible reply, just not the one the
    // model wrote.
    const { ctx, played } = fakeContext((n) => n * 10)
    const queue = new AudioPlaybackQueue(ctx as any)

    // Enqueued without awaiting, exactly as the stream handler does.
    void queue.enqueue({ text: 'first', audio: clip('first', 3) })
    void queue.enqueue({ text: 'second', audio: clip('second', 1) })
    await settled()

    assert.deepEqual(played, ['first', 'second'])
  })

  test('a sentence that will not decode costs that sentence only', async () => {
    const { ctx, played } = fakeContext((n) => n * 10)
    ctx.decodeAudioData = ((audio: ArrayBuffer) => {
      const label = (audio as any).label
      return label === 'bad'
        ? Promise.reject(new Error('corrupt'))
        : Promise.resolve({ duration: 1, label } as any)
    }) as any
    const queue = new AudioPlaybackQueue(ctx as any)

    void queue.enqueue({ text: 'ok', audio: clip('ok', 1) })
    queue.enqueue({ text: 'bad', audio: clip('bad', 1) }).catch(() => {})
    void queue.enqueue({ text: 'after', audio: clip('after', 1) })
    await settled()

    assert.deepEqual(played, ['ok', 'after'])
  })

  test('a decode still in flight when the user cuts in never speaks', async () => {
    // Barge-in has to stop the agent. A sentence whose decode was outstanding
    // at that moment belongs to a reply the user has already talked over, and
    // must not arrive late — least of all after the next reply has begun.
    const { ctx, played } = fakeContext(() => 20)
    const queue = new AudioPlaybackQueue(ctx as any)

    void queue.enqueue({ text: 'abandoned', audio: clip('abandoned', 1) })
    queue.interrupt()
    void queue.enqueue({ text: 'next turn', audio: clip('next turn', 1) })
    await settled()

    assert.deepEqual(played, ['next turn'])
  })

  test('reports what was heard, in order, once the queue drains', async () => {
    const { ctx } = fakeContext((n) => n * 10)
    const queue = new AudioPlaybackQueue(ctx as any)

    void queue.enqueue({ text: 'The first one.', audio: clip('a', 3) })
    void queue.enqueue({ text: 'Second.', audio: clip('b', 1) })
    await settled()

    const heard = queue.interrupt()
    assert.equal(heard.text, 'The first one. Second.')
    assert.equal(heard.complete, true)
  })
})
