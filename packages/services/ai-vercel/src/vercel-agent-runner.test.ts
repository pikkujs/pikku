import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { VercelAgentRunner } from './vercel-agent-runner.js'

describe('VercelAgentRunner.withApiKey', () => {
  test('returns same instance when no providerFactory is set', () => {
    const providers = { openai: {} }
    const runner = new VercelAgentRunner(providers)
    const result = runner.withApiKey('my-key')
    assert.strictEqual(result, runner)
  })

  test('returns new runner with factory-derived providers when providerFactory is set', () => {
    const baseProviders = { openai: { base: true } }
    const factory = (apiKey: string) => ({ openai: { apiKey } })
    const runner = new VercelAgentRunner(baseProviders, factory)

    const scoped = runner.withApiKey('secret-123')

    assert.notStrictEqual(scoped, runner)
    assert.ok(scoped instanceof VercelAgentRunner)
    assert.deepEqual(scoped.providers, { openai: { apiKey: 'secret-123' } })
    assert.deepEqual(runner.providers, baseProviders)
  })

  test('each withApiKey call produces an independent runner', () => {
    const factory = (apiKey: string) => ({ openai: { apiKey } })
    const runner = new VercelAgentRunner({}, factory)

    const first = runner.withApiKey('key-a')
    const second = runner.withApiKey('key-b')

    assert.notStrictEqual(first, second)
    assert.deepEqual(first.providers, { openai: { apiKey: 'key-a' } })
    assert.deepEqual(second.providers, { openai: { apiKey: 'key-b' } })
  })
})

describe('VercelAgentRunner provider resolution', () => {
  /** `getProvider` is private, and the rule it encodes is the unit under test
   *  — going through `run`/`transcribe` would drag a real AI SDK call in. */
  const resolve = (providers: Record<string, unknown>, name: string) =>
    (new VercelAgentRunner(providers) as any).getProvider(name)

  test('an exact entry wins over the catch-all', () => {
    const direct = { name: 'direct' }
    const gateway = { name: 'gateway' }

    // The shape that makes "everything through the gateway except this one"
    // expressible — which is the whole point of the precedence.
    assert.strictEqual(
      resolve({ deepinfra: direct, '*': gateway }, 'deepinfra'),
      direct
    )
    assert.strictEqual(
      resolve({ deepinfra: direct, '*': gateway }, 'anthropic'),
      gateway
    )
  })

  test('the catch-all resolves names nobody registered', () => {
    const scripted = { name: 'scripted' }
    const providers = { '*': scripted }

    // A scripted suite must stay sealed against model strings written after
    // it: no name may fall through to a real endpoint.
    assert.strictEqual(resolve(providers, 'openai'), scripted)
    assert.strictEqual(resolve(providers, 'deepinfra'), scripted)
    assert.strictEqual(resolve(providers, 'invented-yesterday'), scripted)
  })

  test('without a catch-all an unknown provider still throws, naming what exists', () => {
    assert.throws(
      () => resolve({ openai: {} }, 'deepinfra'),
      /Unknown AI provider: 'deepinfra'\. Available: openai/
    )
  })

  test('an empty record throws rather than resolving to undefined', () => {
    assert.throws(() => resolve({}, 'openai'), /Available: none/)
  })
})

describe('VercelAgentRunner.transcribe on silence', () => {
  /** A provider whose model transcribes everything to nothing. */
  const silentProvider = (text: string) => ({
    transcription: (modelId: string) => ({
      specificationVersion: 'v3' as const,
      provider: 'stub',
      modelId,
      async doGenerate() {
        return {
          text,
          segments: [],
          warnings: [],
          response: { timestamp: new Date(0), modelId, headers: {} },
        }
      },
    }),
  })

  const runner = (text: string) =>
    new VercelAgentRunner({ stub: silentProvider(text) })

  test('a turn with no speech returns empty text rather than throwing', async () => {
    // The AI SDK treats an empty transcript as an error, which is right for a
    // transcription job and wrong at a microphone: a pause is the most ordinary
    // thing a silence detector can hand us, and it must not fail the run.
    const result = await runner('').transcribe({
      model: 'stub/whisper',
      audio: new Uint8Array([1, 2, 3]),
    })

    assert.equal(result.text, '')
    assert.deepEqual(result.segments, [])
  })

  test('a real transcript still comes through untouched', async () => {
    const result = await runner('the transcribed spoken words').transcribe({
      model: 'stub/whisper',
      audio: new Uint8Array([1, 2, 3]),
    })

    assert.equal(result.text, 'the transcribed spoken words')
  })
})
