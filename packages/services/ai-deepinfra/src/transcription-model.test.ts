import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeepInfra } from './index.js'

/** Captures the request and answers with `body`, so no key and no network. */
const stubFetch = (
  body: unknown,
  init: { status?: number; contentType?: string } = {}
) => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch = (async (url: string, requestInit: RequestInit) => {
    calls.push({ url, init: requestInit })
    const payload = typeof body === 'string' ? body : JSON.stringify(body ?? {})
    return new Response(payload, {
      status: init.status ?? 200,
      headers: {
        'content-type': init.contentType ?? 'application/json',
      },
    })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

const audio = new Uint8Array([1, 2, 3, 4])

describe('DeepInfraTranscriptionModel', () => {
  test('posts the model id as a path segment, slashes intact', async () => {
    const { fetch, calls } = stubFetch({ text: 'hello' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription(
      'openai/whisper-large-v3-turbo'
    )

    await model.doGenerate({ audio, mediaType: 'audio/wav' })

    // The embedded slash is the model id, not a route separator — nothing may
    // split or escape it.
    assert.equal(
      calls[0]!.url,
      'https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo'
    )
  })

  test("sends the audio under 'audio', which is why an OpenAI client cannot be aimed here", async () => {
    const { fetch, calls } = stubFetch({ text: 'hello' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')

    await model.doGenerate({ audio, mediaType: 'audio/mpeg' })

    const body = calls[0]!.init.body as FormData
    assert.ok(body instanceof FormData)
    assert.ok(body.get('audio'), "expected an 'audio' part")
    assert.equal(body.get('file'), null, "OpenAI's field name must be absent")
    assert.equal((body.get('audio') as File).name, 'audio.mp3')
  })

  test('accepts base64 audio as well as bytes', async () => {
    const { fetch, calls } = stubFetch({ text: 'hello' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')

    await model.doGenerate({
      audio: Buffer.from(audio).toString('base64'),
      mediaType: 'audio/wav',
    })

    const part = (calls[0]!.init.body as FormData).get('audio') as File
    assert.deepEqual(new Uint8Array(await part.arrayBuffer()), audio)
  })

  test('maps text, language, segments and duration', async () => {
    const { fetch } = stubFetch({
      text: 'the transcribed spoken words',
      language: 'en',
      input_length_ms: 2500,
      segments: [{ text: 'the transcribed', start: 0, end: 1.2 }],
    })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')

    const result = await model.doGenerate({ audio, mediaType: 'audio/wav' })

    assert.equal(result.text, 'the transcribed spoken words')
    assert.equal(result.language, 'en')
    assert.equal(result.durationInSeconds, 2.5)
    assert.deepEqual(result.segments, [
      { text: 'the transcribed', startSecond: 0, endSecond: 1.2 },
    ])
  })

  test('drops unusable segments rather than losing the transcript', async () => {
    const { fetch } = stubFetch({
      text: 'still here',
      segments: [
        { text: 'good', start: 0, end: 1 },
        { text: 'no timings' },
        { start: 1, end: 2 },
        'not an object',
        { text: 'nan', start: Number.NaN, end: 2 },
      ],
    })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')

    const result = await model.doGenerate({ audio, mediaType: 'audio/wav' })

    // A caller who only wanted the words still gets them.
    assert.equal(result.text, 'still here')
    assert.deepEqual(result.segments, [
      { text: 'good', startSecond: 0, endSecond: 1 },
    ])
  })

  test('reports per-segment confidence without acting on it', async () => {
    // The real measured turn: "Thank you." invented after a genuine question.
    // Both fields fail to separate them — no_speech is 0.000 either way and the
    // logprobs are a fifth of a nat apart — which is why the text comes back
    // whole and the numbers come back as diagnostics.
    const { fetch } = stubFetch({
      text: ' Hey, is this working okay?  Thank you.',
      segments: [
        {
          text: ' Hey, is this working okay?',
          start: 0.3,
          end: 2.1,
          no_speech_prob: 0,
          avg_logprob: -0.3,
        },
        {
          text: ' Thank you.',
          start: 2.1,
          end: 2.5,
          no_speech_prob: 0,
          avg_logprob: -0.52,
        },
      ],
    })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')

    const result = await model.doGenerate({ audio, mediaType: 'audio/wav' })

    assert.equal(result.text, ' Hey, is this working okay?  Thank you.')
    assert.deepEqual(result.providerMetadata?.['deepinfra'], {
      segments: [
        {
          text: ' Hey, is this working okay?',
          startSecond: 0.3,
          endSecond: 2.1,
          noSpeechProbability: 0,
          avgLogProbability: -0.3,
        },
        {
          text: ' Thank you.',
          startSecond: 2.1,
          endSecond: 2.5,
          noSpeechProbability: 0,
          avgLogProbability: -0.52,
        },
      ],
    })
  })

  test("'auto' is a detection mode, not a language, so it is not reported as one", async () => {
    const { fetch } = stubFetch({ text: 'hello', language: 'auto' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription(
      'nvidia/Nemotron-3.5-ASR-Streaming-Multilingual-0.6b'
    )

    const result = await model.doGenerate({ audio, mediaType: 'audio/wav' })

    assert.equal(result.language, undefined)
  })

  test('non-speech comes back as an empty transcript, not as filler', async () => {
    // Nemotron's answer to silence, and the property the whole no-speech check
    // now rests on. Recorded here so a model swap that breaks it is a test
    // failure rather than a conversation about nothing.
    const { fetch } = stubFetch({
      text: '',
      segments: [],
      language: 'auto',
      input_length_ms: 4000,
    })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription(
      'nvidia/Nemotron-3.5-ASR-Streaming-Multilingual-0.6b'
    )

    const result = await model.doGenerate({ audio, mediaType: 'audio/wav' })

    assert.equal(result.text, '')
    assert.deepEqual(result.segments, [])
    assert.equal(result.providerMetadata, undefined)
  })

  test('omits confidence entirely when the provider reports none', async () => {
    const { fetch } = stubFetch({
      text: 'hello',
      segments: [{ text: 'hello', start: 0, end: 1 }],
    })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')

    const result = await model.doGenerate({ audio, mediaType: 'audio/wav' })

    // Absent, not zero — a fabricated 0 would read as "certainly speech".
    assert.equal(result.providerMetadata, undefined)
  })

  test('a missing segments field is empty, not a crash', async () => {
    const { fetch } = stubFetch({ text: 'hello' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')

    const result = await model.doGenerate({ audio, mediaType: 'audio/wav' })

    assert.deepEqual(result.segments, [])
    assert.equal(result.language, undefined)
    assert.equal(result.durationInSeconds, undefined)
  })

  test('a failure names the model and keeps the body', async () => {
    const { fetch } = stubFetch('{"detail":"model not found"}', { status: 404 })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription(
      'openai/nope'
    )

    await assert.rejects(
      () => model.doGenerate({ audio, mediaType: 'audio/wav' }),
      /'openai\/nope' failed with 404.*model not found/s
    )
  })

  test('forwards the abort signal so barge-in cancels work in flight', async () => {
    const { fetch, calls } = stubFetch({ text: 'hello' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).transcription('m')
    const controller = new AbortController()

    await model.doGenerate({
      audio,
      mediaType: 'audio/wav',
      abortSignal: controller.signal,
    })

    assert.equal(calls[0]!.init.signal, controller.signal)
  })

  test('the key is demanded at call time, naming the env var', async () => {
    const { fetch } = stubFetch({ text: 'hello' })
    const previous = process.env.DEEPINFRA_API_KEY
    delete process.env.DEEPINFRA_API_KEY
    try {
      // Constructing without a key is fine — only the call needs one.
      const model = createDeepInfra({ fetch }).transcription('m')
      await assert.rejects(
        () => model.doGenerate({ audio, mediaType: 'audio/wav' }),
        /DEEPINFRA_API_KEY/
      )
    } finally {
      if (previous !== undefined) process.env.DEEPINFRA_API_KEY = previous
    }
  })
})
