import { describe, it, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { BaseBundler, getDeadGenFilePatterns } from './bundler.js'
import type { CompileInput, CompileResult } from './bundler.interface.js'
import type { DeploymentManifest, DeploymentUnit } from './types.js'

/** A bundler whose compile always fails, so only the dispatch around it is under test. */
class FailingBundler extends BaseBundler {
  public readonly platforms: string[] = []

  constructor(private readonly failure: string) {
    super()
  }

  protected async compile(input: CompileInput): Promise<CompileResult> {
    this.platforms.push(input.platform)
    throw new Error(this.failure)
  }
}

const unit = (name: string): DeploymentUnit => ({
  name,
  role: 'function',
  target: 'serverless',
  functionIds: [],
  services: [],
  dependsOn: [],
  handlers: [],
  tags: [],
})

const manifest = (name: string): DeploymentManifest =>
  ({
    projectId: 'test',
    manifestVersion: 1,
    units: [unit(name)],
    queues: [],
    scheduledTasks: [],
    channels: [],
    agents: [],
    mcpEndpoints: [],
    workflows: [],
    secrets: [],
  }) as unknown as DeploymentManifest

describe('BaseBundler serverless dispatch', () => {
  let dir: string
  let sharpRoot: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pikku-bundler-'))
    sharpRoot = join(dir, 'node_modules', 'sharp')
    await mkdir(sharpRoot, { recursive: true })
    await writeFile(
      join(sharpRoot, 'package.json'),
      JSON.stringify({ name: 'sharp', gypfile: true })
    )
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const bundle = async (bundler: FailingBundler, platform?: string) =>
    bundler.bundleUnits(
      dir,
      manifest('enrich-candidate'),
      new Map([['enrich-candidate', join(dir, 'entry.ts')]]),
      join(dir, 'build'),
      platform ? ({ platform } as never) : {}
    )

  test('a native addon in a serverless bundle is reported as one', async () => {
    const original = `Could not resolve "node:child_process" @ ${sharpRoot}/dist/libvips.mjs`
    const bundler = new FailingBundler(original)

    const { errors } = await bundle(bundler, 'neutral')

    assert.equal(bundler.platforms[0], 'neutral', 'the compile ran serverless')
    assert.equal(errors.length, 1)
    assert.match(errors[0]!.error, /cannot be built for a serverless target/)
    assert.match(errors[0]!.error, /sharp — builds a native addon with node-gyp/)
    assert.match(errors[0]!.error, /serverlessIncompatible/)
    assert.ok(
      errors[0]!.error.includes(original),
      'the compiler s own message is kept below the diagnosis'
    )
  })

  test('a compile failure that is not an addon keeps its own message', async () => {
    const original = `Expected ")" but found ";" @ ${sharpRoot}/dist/libvips.mjs`
    const bundler = new FailingBundler(original)

    const { errors } = await bundle(bundler, 'neutral')

    assert.equal(errors.length, 1)
    assert.equal(errors[0]!.error, original)
  })

  test('the node platform never goes through the serverless diagnosis', async () => {
    const original = `Could not resolve "node:child_process" @ ${sharpRoot}/dist/libvips.mjs`
    const bundler = new FailingBundler(original)

    const { errors } = await bundle(bundler)

    assert.equal(bundler.platforms[0], 'node', 'node is the default platform')
    assert.equal(
      errors[0]!.error,
      original,
      'a container build can load the addon, so there is nothing to diagnose'
    )
  })
})

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
