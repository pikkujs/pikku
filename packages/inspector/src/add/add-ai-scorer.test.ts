import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => {
      criticals.push({ code, message })
    },
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

const inspectSources = async (sources: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-ai-scorer-'))
  const files: Record<string, string> = {}
  for (const [name, source] of Object.entries(sources)) {
    files[name] = join(rootDir, name)
    await writeFile(files[name]!, source)
  }
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  try {
    const state = await inspect(makeLogger(criticals), Object.values(files), {
      rootDir,
    })
    return { state, criticals }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const inspectSource = (source: string) =>
  inspectSources({ 'grading.scorer.ts': source })

describe('addAIScorer', () => {
  test('reads the lane off which constructor was called, not off a field', async () => {
    const { state, criticals } = await inspectSource(
      [
        `export const brevity = pikkuAIScorer({`,
        `  name: 'brevity',`,
        `  description: 'Shorter answers score higher',`,
        `  score: () => ({ score: 1 }),`,
        `})`,
        `export const helpfulness = pikkuAIJudge({`,
        `  name: 'helpfulness',`,
        `  description: 'Does the answer help',`,
        `  model: 'claude-opus-5',`,
        `  goal: 'Grade helpfulness.',`,
        `})`,
      ].join('\n')
    )

    assert.deepEqual(criticals, [])
    assert.equal(state.scorers.scorersMeta['brevity']?.lane, 'fast')
    assert.equal(state.scorers.scorersMeta['helpfulness']?.lane, 'slow')
  })

  test('defaults an unstated sample rate to grading every run', async () => {
    const { state } = await inspectSource(
      [
        `export const brevity = pikkuAIScorer({`,
        `  name: 'brevity',`,
        `  description: 'Shorter answers score higher',`,
        `  score: () => ({ score: 1 }),`,
        `})`,
      ].join('\n')
    )

    assert.equal(state.scorers.scorersMeta['brevity']?.sampleRate, 1)
    assert.equal(state.scorers.scorersMeta['brevity']?.requiresReference, false)
  })

  test('carries the sample rate and the reference requirement into the meta', async () => {
    const { state } = await inspectSource(
      [
        `export const correctness = pikkuAIJudge({`,
        `  name: 'correctness',`,
        `  description: 'Is the answer right',`,
        `  model: 'claude-opus-5',`,
        `  goal: 'Grade correctness.',`,
        `  sampleRate: 0.1,`,
        `  requiresReference: true,`,
        `})`,
      ].join('\n')
    )

    assert.equal(state.scorers.scorersMeta['correctness']?.sampleRate, 0.1)
    assert.equal(
      state.scorers.scorersMeta['correctness']?.requiresReference,
      true
    )
  })

  test('rejects a sample rate that is not a fraction', async () => {
    const { state, criticals } = await inspectSource(
      [
        `export const brevity = pikkuAIScorer({`,
        `  name: 'brevity',`,
        `  description: 'Shorter answers score higher',`,
        `  sampleRate: 50,`,
        `  score: () => ({ score: 1 }),`,
        `})`,
      ].join('\n')
    )

    assert.equal(criticals[0]?.code, ErrorCode.INVALID_VALUE)
    assert.match(criticals[0]!.message, /between 0 and 1/)
    assert.deepEqual(state.scorers.scorersMeta, {})
  })

  test('a scorer with no description is refused, since the meta is what names it', async () => {
    const { criticals } = await inspectSource(
      [
        `export const brevity = pikkuAIScorer({`,
        `  name: 'brevity',`,
        `  score: () => ({ score: 1 }),`,
        `})`,
      ].join('\n')
    )

    assert.equal(criticals[0]?.code, ErrorCode.MISSING_DESCRIPTION)
  })

  test('records where a scorer was declared, so codegen can import it back', async () => {
    const { state } = await inspectSource(
      [
        `export const brevity = pikkuAIScorer({`,
        `  name: 'brevity',`,
        `  description: 'Shorter answers score higher',`,
        `  score: () => ({ score: 1 }),`,
        `})`,
      ].join('\n')
    )

    assert.equal(state.scorers.files.get('brevity')?.exportedName, 'brevity')
    assert.match(
      state.scorers.files.get('brevity')?.path ?? '',
      /grading\.scorer\.ts$/
    )
  })
})

describe('an agent asking to be graded', () => {
  const scorerFile = [
    `export const brevity = pikkuAIScorer({`,
    `  name: 'brevity',`,
    `  description: 'Shorter answers score higher',`,
    `  score: () => ({ score: 1 }),`,
    `})`,
  ].join('\n')

  const agent = (scorers: string) =>
    [
      `export const assistant = pikkuAIAgent({`,
      `  name: 'assistant',`,
      `  description: 'Answers questions',`,
      `  goal: 'Answer the question.',`,
      `  model: 'anthropic/claude-opus-5',`,
      `  scorers: [${scorers}],`,
      `})`,
    ].join('\n')

  test('carries the named scorers onto the agent meta', async () => {
    const { state, criticals } = await inspectSources({
      'grading.scorer.ts': scorerFile,
      'assistant.agent.ts': agent(`'brevity'`),
    })

    assert.deepEqual(criticals, [])
    assert.deepEqual(state.agents.agentsMeta['assistant']?.scorers, ['brevity'])
  })

  test('naming a scorer that does not exist fails the build rather than grading nothing', async () => {
    const { criticals } = await inspectSources({
      'grading.scorer.ts': scorerFile,
      'assistant.agent.ts': agent(`'brevty'`),
    })

    const finding = criticals.find(
      (critical) => critical.code === ErrorCode.AGENT_SCORER_NOT_FOUND
    )
    assert.ok(finding, `expected a scorer-not-found critical`)
    assert.match(finding!.message, /brevty/)
    assert.match(finding!.message, /Declared scorers: brevity/)
  })
})
