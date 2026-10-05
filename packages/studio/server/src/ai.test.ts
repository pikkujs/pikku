import assert from 'node:assert'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { StudioAi } from './ai.js'

const home = () => mkdtemp(join(tmpdir(), 'pikku-studio-ai-'))

describe('StudioAi', () => {
  test('a key choice hands the project its key, base URL and model', async () => {
    const ai = new StudioAi(await home())
    assert.equal(await ai.choice(), null)
    const choice = await ai.set({ kind: 'key', provider: 'anthropic', apiKey: ' sk-ant ' })
    assert.deepEqual(choice, { kind: 'key', provider: 'anthropic', model: 'claude-haiku-4-5' })
    const env = await ai.env()
    assert.equal(env.ANTHROPIC_API_KEY, 'sk-ant')
    assert.equal(env.PIKKU_STUDIO_AI_KEY, 'sk-ant')
    assert.equal(env.PIKKU_STUDIO_AI_BASE_URL, 'https://api.anthropic.com/v1')
    assert.equal(env.OPENAI_API_KEY, undefined)
  })

  test('keeps keys out of the choice file and private', async () => {
    const dir = await home()
    const ai = new StudioAi(dir)
    await ai.set({ kind: 'key', provider: 'openai', apiKey: 'sk-1', model: 'gpt-5-mini' })
    assert.equal(((await stat(join(dir, 'ai-keys.json'))).mode & 0o777).toString(8), '600')
    assert.doesNotMatch(JSON.stringify(await ai.choice()), /sk-1/)
    assert.equal((await ai.env()).PIKKU_STUDIO_MODEL, 'gpt-5-mini')
  })

  test('refuses an unknown provider, an empty key and a Claude subscription', async () => {
    const ai = new StudioAi(await home())
    await assert.rejects(ai.set({ kind: 'key', provider: 'nope', apiKey: 'x' }))
    await assert.rejects(ai.set({ kind: 'key', provider: 'openai', apiKey: ' ' }))
    await assert.rejects(ai.set({ kind: 'subscription', provider: 'anthropic' }))
  })

  test('a subscription or Fabric passes no key', async () => {
    const ai = new StudioAi(await home())
    await ai.set({ kind: 'subscription', provider: 'openai-codex' })
    assert.deepEqual(await ai.env(), { PIKKU_STUDIO_AI: 'subscription', PIKKU_STUDIO_AI_PROVIDER: 'openai-codex' })
    await ai.set({ kind: 'fabric' })
    assert.deepEqual(await ai.env(), { PIKKU_STUDIO_AI: 'fabric' })
  })
})
