import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildJudgePrompt, runJudge } from './agent-scorer-judge.js'
import { pikkuAgentJudge } from './agent-scorer.js'
import type { ScorerInput } from './agent-scorer.types.js'
import type { AgentRunnerService } from '../../services/agent-runner-service.js'

const input = (overrides: Partial<ScorerInput> = {}): ScorerInput => ({
  runId: 'run-1',
  agentName: 'assistant',
  input: 'what is the capital of France?',
  output: 'Paris',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  ...overrides,
})

const runner = (object: unknown, seen?: { params: any }): AgentRunnerService =>
  ({
    run: async (params: any) => {
      if (seen) seen.params = params
      return { object, usage: { inputTokens: 100, outputTokens: 20 } }
    },
  }) as unknown as AgentRunnerService

describe('buildJudgePrompt', () => {
  test('shows the answer key to a reference-based judge', () => {
    const scorer = pikkuAgentJudge({
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
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })

    const prompt = buildJudgePrompt(scorer.judge!, input())

    assert.doesNotMatch(prompt, /Reference answer/)
    assert.match(prompt, /Grade helpfulness\./)
  })

  test('shows which tools ran, so an answer is distinguishable from a guess', () => {
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })

    const prompt = buildJudgePrompt(
      scorer.judge!,
      input({
        toolCalls: [
          { name: 'listTodos', args: {}, result: { todos: ['Buy groceries'] } },
        ],
      })
    )

    assert.match(prompt, /Tools the assistant ran:\n- listTodos/)
  })

  test('the default disclosure sends the judge no arguments and no results', () => {
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })

    const prompt = buildJudgePrompt(
      scorer.judge!,
      input({
        toolCalls: [
          {
            name: 'lookupCustomer',
            args: { email: 'ada@example.com' },
            result: { address: '12 Mill Lane' },
          },
        ],
      })
    )

    assert.doesNotMatch(prompt, /ada@example\.com/)
    assert.doesNotMatch(prompt, /Mill Lane/)
  })

  test('a run that called nothing gets no tool section rather than an empty one', () => {
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })

    assert.doesNotMatch(buildJudgePrompt(scorer.judge!, input()), /Tools the/)
  })

  test('a failed call is shown as failed, which is not the same as no call', () => {
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })

    const prompt = buildJudgePrompt(
      scorer.judge!,
      input({
        toolCalls: [
          {
            name: 'listTodos',
            args: {},
            error: 'no such user ada@example.com',
          },
        ],
      })
    )

    assert.match(prompt, /- listTodos \(failed\)/)
    assert.doesNotMatch(prompt, /ada@example\.com/)
  })

  test("'full' shows the arguments and results, for a judge that grades against them", () => {
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
      toolCalls: 'full',
    })

    const prompt = buildJudgePrompt(
      scorer.judge!,
      input({
        toolCalls: [
          { name: 'listTodos', args: {}, result: { todos: ['Buy groceries'] } },
          { name: 'save', args: {}, error: 'store unreachable' },
        ],
      })
    )

    assert.match(
      prompt,
      /listTodos\(\{\}\) returned \{"todos":\["Buy groceries"\]\}/
    )
    assert.match(prompt, /save\(\{\}\) failed: store unreachable/)
  })

  test("'off' withholds the trajectory entirely, even from a run that used tools", () => {
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
      toolCalls: 'off',
    })

    const prompt = buildJudgePrompt(
      scorer.judge!,
      input({ toolCalls: [{ name: 'listTodos', args: {}, result: {} }] })
    )

    assert.doesNotMatch(prompt, /Tools the/)
    assert.doesNotMatch(prompt, /listTodos/)
  })

  test('a large tool result is truncated rather than crowding out the answer', () => {
    const scorer = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
      toolCalls: 'full',
    })

    const prompt = buildJudgePrompt(
      scorer.judge!,
      input({
        toolCalls: [{ name: 'search', args: {}, result: 'x'.repeat(5000) }],
      })
    )

    assert.match(prompt, /… \(truncated\)/)
    assert.ok(prompt.length < 1500, `prompt was ${prompt.length} characters`)
  })

  test('a scorer that supplies its own prompt replaces the framing entirely', () => {
    const scorer = pikkuAgentJudge({
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
  const helpfulness = pikkuAgentJudge({
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
    const correctness = pikkuAgentJudge({
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
