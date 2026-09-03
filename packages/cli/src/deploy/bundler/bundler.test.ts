import { describe, it } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getDeadGenFilePatterns } from './bundler.js'

/**
 * Write a unit output dir whose services gen declares `services`, in the same
 * shape `pikku all` emits — alphabetical, one quoted key per line.
 */
const unitWithServices = async (
  services: Record<string, boolean>
): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-bundler-'))
  await mkdir(join(dir, '.pikku'), { recursive: true })
  const body = Object.keys(services)
    .sort()
    .map((name) => `  '${name}': ${services[name]},`)
    .join('\n')
  await writeFile(
    join(dir, '.pikku', 'pikku-services.gen.ts'),
    `export const requiredSingletonServices = {\n${body}\n}\n`,
    'utf-8'
  )
  return dir
}

const stubs = (patterns: RegExp[], specifier: string): boolean =>
  patterns.some((p) => p.test(specifier))

describe('getDeadGenFilePatterns', () => {
  it('stubs the AI SDKs for a unit that wires no model', async () => {
    const dir = await unitWithServices({ agentRunner: false, ai: false })
    const patterns = await getDeadGenFilePatterns(dir)

    assert.ok(stubs(patterns, '@pikku/ai-vercel'))
    assert.ok(stubs(patterns, '@ai-sdk/openai-compatible'))
    assert.ok(stubs(patterns, 'ai'))
  })

  it('keeps the AI SDKs for a unit that wires `ai` but not `agentRunner`', async () => {
    // Idem's shape, and the regression this covers: nine units destructured
    // `ai`, so the analyzer granted them 'ai-model' while the stub pass saw
    // `agentRunner: false` and replaced @pikku/ai-vercel with `export {}`.
    // Every one of those bundles then failed on "No matching export in
    // pikku-stub:@pikku/ai-vercel for import VercelAgentRunner".
    const dir = await unitWithServices({ agentRunner: false, ai: true })
    const patterns = await getDeadGenFilePatterns(dir)

    assert.ok(!stubs(patterns, '@pikku/ai-vercel'))
    assert.ok(!stubs(patterns, '@ai-sdk/openai-compatible'))
    assert.ok(!stubs(patterns, 'ai'))
  })

  it('keeps the AI SDKs for a unit that wires `agentRunner` but not `ai`', async () => {
    const dir = await unitWithServices({ agentRunner: true, ai: false })
    const patterns = await getDeadGenFilePatterns(dir)

    assert.ok(!stubs(patterns, '@pikku/ai-vercel'))
    assert.ok(!stubs(patterns, '@ai-sdk/openai-compatible'))
  })

  it('still stubs an unrelated service the model does not claim', async () => {
    // `ai` must rescue only its own module set — metaService is keyed to a gen
    // file and has nothing to do with a model.
    const dir = await unitWithServices({
      agentRunner: false,
      ai: true,
      metaService: false,
    })
    const patterns = await getDeadGenFilePatterns(dir)

    assert.ok(!stubs(patterns, '@pikku/ai-vercel'))
    assert.ok(stubs(patterns, 'src/.pikku/pikku-meta-service.gen.ts'))
  })

  it('returns no patterns when the unit has no services gen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-bundler-'))
    assert.deepEqual(await getDeadGenFilePatterns(dir), [])
  })
})
