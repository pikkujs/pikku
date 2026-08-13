import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildJudgePrompt, runJudge } from './ai-scorer-judge.js'
import { pikkuAIJudge } from './ai-scorer.js'
import type { ScorerInput } from './ai-scorer.types.js'
import type { AIAgentRunnerService } from '../../services/ai-agent-runner-service.js'

const input = (overrides: Partial<ScorerInput> = {}): ScorerInput => ({
  runId: 'run-1',
  agentName: 'assistant',
  input: 'what is the capital of France?',
  output: 'Paris',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  ...overrides,
})

const runner = (
  object: unknown,
  seen?: { params: any }
): AIAgentRunnerService =>
  ({
    run: async (params: any) => {
      if (seen) seen.params = params
      return { object, usage: { inputTokens: 100, outputTokens: 20 } }
    },
  }) as unknown as AIAgentRunnerService

describe('buildJudgePrompt', () => {
  test('shows the answer key to a reference-based judge', () => {
    const scorer = pikkuAIJudge({
      name: 'correctness',
      description: 'Is the answer right',
      model: 'claude-opus-5',
      goal: 'Grade correctness.',
      requiresReference: true,
    })

    const prompt = buildJudgePrompt(
      scorer.judge!,
      input({ reference: 'Paris' })
    )

    assert.match(prompt, /Reference answer:\nParis/)
  })

  test('withholds a reference section when there is no answer key', () => {
    const scorer = pikkuAIJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })

    const prompt = buildJudgePrompt(scorer.judge!, input())

    assert.doesNotMatch(prompt, /Reference answer/)
    assert.match(prompt, /Grade helpfulness\./)
  })

  test('a scorer that supplies its own prompt replaces the framing entirely', () => {
    const scorer = pikkuAIJudge({
      name: 'custom',
      description: 'Custom framing',
      model: 'claude-opus-5',
      goal: 'ignored',
      prompt: (run) => `Only this: ${run.output}`,
    })

    assert.equal(buildJudgePrompt(scorer.judge!, input()), 'Only this: Paris')
  })
})

describe('runJudge', () => {
  const helpfulness = pikkuAIJudge({
    name: 'helpfulness',
    description: 'Is the answer useful',
    model: 'claude-opus-5',
    goal: 'Grade helpfulness.',
  })

  test('records the score, the reason and what the judgement cost', async () => {
    const result = await runJudge(
      helpfulness,
      input(),
      runner({ score: 0.8, reason: 'Direct and correct.' })
    )

    assert.equal(result.score, 0.8)
    assert.equal(result.reason, 'Direct and correct.')
    assert.deepEqual(result.metadata, {
      judgeModel: 'claude-opus-5',
      judgeTokens: 120,
    })
  })

  test('clamps an out-of-range score rather than losing the judgement', async () => {
    const high = await runJudge(helpfulness, input(), runner({ score: 1.4 }))
    const low = await runJudge(helpfulness, input(), runner({ score: -2 }))

    assert.equal(high.score, 1)
    assert.equal(low.score, 0)
  })

  test('rejects a non-numeric score, which is not a judgement at all', async () => {
    await assert.rejects(
      () => runJudge(helpfulness, input(), runner({ score: 'great' })),
      /non-numeric score/
    )
  })

  test('gives the judge no tools, so its structured output is actually honoured', async () => {
    const seen = { params: undefined as any }
    await runJudge(helpfulness, input(), runner({ score: 1 }, seen))

    assert.deepEqual(seen.params.tools, [])
    assert.equal(seen.params.toolChoice, 'none')
    assert.equal(seen.params.maxSteps, 1)
    assert.equal(seen.params.model, 'claude-opus-5')
  })

  test('names the missing provider rather than failing as an undefined call', async () => {
    await assert.rejects(
      () => runJudge(helpfulness, input(), undefined),
      /needs an AI provider/
    )
  })

  test('refuses to grade a reference-based judge with no answer key', async () => {
    const correctness = pikkuAIJudge({
      name: 'correctness',
      description: 'Is the answer right',
      model: 'claude-opus-5',
      goal: 'Grade correctness.',
      requiresReference: true,
    })

    await assert.rejects(
      () => runJudge(correctness, input(), runner({ score: 1 })),
      /grades against a reference answer/
    )
  })
})
