import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeepInfra } from './index.js'

const stubFetch = (
  body: unknown,
  init: { status?: number; contentType?: string } = {}
) => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch = (async (url: string, requestInit: RequestInit) => {
    calls.push({ url, init: requestInit })
    const payload =
      body instanceof Uint8Array
        ? body
        : typeof body === 'string'
          ? body
          : JSON.stringify(body ?? {})
    return new Response(payload as BodyInit, {
      status: init.status ?? 200,
      headers: { 'content-type': init.contentType ?? 'application/json' },
    })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

const wavDataUri = 'data:audio/wav;base64,UklGRiQ='

describe('DeepInfraSpeechModel', () => {
  test('posts JSON to the model path with the standard options mapped', async () => {
    const { fetch, calls } = stubFetch({ audio: wavDataUri })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech(
      'hexgrad/Kokoro-82M'
    )

    await model.doGenerate({
      text: 'hello there',
      voice: 'af_bella',
      speed: 1.1,
      outputFormat: 'wav',
      language: 'en',
    })

    assert.equal(
      calls[0]!.url,
      'https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M'
    )
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), {
      // Both names, because the models disagree on which they want: Kokoro
      // requires `text`, Qwen3-TTS requires `input` and rejects a body without
      // it. Each tolerates the other as an extra, so one body serves both.
      text: 'hello there',
      input: 'hello there',
      preset_voice: 'af_bella',
      speed: 1.1,
      output_format: 'wav',
      language: 'en',
    })
  })

  test('strips the data URI prefix but does not decode the base64', async () => {
    const { fetch } = stubFetch({ audio: wavDataUri })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech('m')

    const result = await model.doGenerate({ text: 'hi' })

    // The V3 contract says base64 comes back as base64 — decoding here would
    // only be re-encoded a layer up.
    assert.equal(result.audio, 'UklGRiQ=')
  })

  test('passes raw bytes through untouched', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3])
    const { fetch } = stubFetch(bytes, { contentType: 'audio/wav' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech('m')

    const result = await model.doGenerate({ text: 'hi' })

    assert.ok(result.audio instanceof Uint8Array)
    assert.deepEqual(result.audio, bytes)
  })

  test('warns about instructions rather than dropping them silently', async () => {
    const { fetch } = stubFetch({ audio: wavDataUri })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech('m')

    const result = await model.doGenerate({
      text: 'hi',
      instructions: 'speak slowly and warmly',
    })

    // Silently ignoring it is how a caller ends up trusting a setting that
    // never took effect.
    assert.equal(result.warnings.length, 1)
    assert.equal(result.warnings[0]!.type, 'unsupported')
    assert.equal(
      (result.warnings[0] as { feature: string }).feature,
      'instructions'
    )
  })

  test('provider options ride through for per-model knobs', async () => {
    const { fetch, calls } = stubFetch({ audio: wavDataUri })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech('m')

    await model.doGenerate({
      text: 'hi',
      providerOptions: { deepinfra: { seed: 7 } },
    })

    assert.equal(JSON.parse(calls[0]!.init.body as string).seed, 7)
  })

  test('JSON without an audio string fails loudly', async () => {
    const { fetch } = stubFetch({ detail: 'quota exceeded' })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech('m')

    await assert.rejects(
      () => model.doGenerate({ text: 'hi' }),
      /returned JSON without an 'audio' string/
    )
  })

  test('a failure names the model and keeps the body', async () => {
    const { fetch } = stubFetch('{"detail":"bad voice"}', { status: 422 })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech(
      'hexgrad/Kokoro-82M'
    )

    await assert.rejects(
      () => model.doGenerate({ text: 'hi' }),
      /'hexgrad\/Kokoro-82M' failed with 422.*bad voice/s
    )
  })

  test('omitted options are omitted, not sent as null', async () => {
    const { fetch, calls } = stubFetch({ audio: wavDataUri })
    const model = createDeepInfra({ apiKey: 'k', fetch }).speech('m')

    await model.doGenerate({ text: 'hi' })

    const body = calls[0]!.init.body as string
    assert.deepEqual(JSON.parse(body), { text: 'hi', input: 'hi' })
  })

  test('both provider method names return a usable model', () => {
    const provider = createDeepInfra({ apiKey: 'k' })

    // Runners probe for one name or the other; both must work.
    assert.equal(provider.speech('m').modelId, 'm')
    assert.equal(provider.speechModel('m').modelId, 'm')
    assert.equal(provider.transcription('m').specificationVersion, 'v3')
    assert.equal(provider.transcriptionModel('m').provider, 'deepinfra')
  })
})
