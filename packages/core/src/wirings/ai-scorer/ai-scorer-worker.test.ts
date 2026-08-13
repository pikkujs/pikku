import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { pikkuAIScoreWorkerFunc } from './ai-scorer-worker.js'
import { pikkuAIJudge, pikkuAIScorer } from './ai-scorer.js'
import type { PikkuAIScorer, ScoreJob } from './ai-scorer.types.js'

const job = (overrides: Partial<ScoreJob> = {}): ScoreJob => ({
  scorerName: 'brevity',
  runId: 'run-1',
  agentName: 'assistant',
  input: 'what is the capital of France?',
  output: 'Paris',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  ...overrides,
})

const install = (scorer: PikkuAIScorer, aiAgentRunner?: unknown) => {
  pikkuState(null, 'agent', 'scorers').set(scorer.name, scorer)
  const saved: unknown[] = []
  pikkuState(null, 'package', 'singletonServices', {
    aiRunState: {
      saveScore: async (score: unknown) => {
        saved.push(score)
      },
    },
    aiAgentRunner,
  } as never)
  return saved
}

describe('pikkuAIScoreWorkerFunc', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('records what a heuristic scorer graded, against the run it graded', async () => {
    const saved = install(
      pikkuAIScorer({
        name: 'brevity',
        description: 'Shorter is better',
        score: (input) => ({
          score: input.output.length < 20 ? 1 : 0,
          reason: 'Answered in one word.',
        }),
      })
    )

    await pikkuAIScoreWorkerFunc({}, job())

    assert.deepEqual(saved, [
      {
        runId: 'run-1',
        scorerName: 'brevity',
        score: 1,
        reason: 'Answered in one word.',
      },
    ])
  })

  test('hands a judge to the model rather than calling a score function it has not got', async () => {
    const saved = install(
      pikkuAIJudge({
        name: 'helpfulness',
        description: 'Is the answer useful',
        model: 'claude-opus-5',
        goal: 'Grade helpfulness.',
      }),
      {
        run: async () => ({
          object: { score: 0.5, reason: 'Terse.' },
          usage: { inputTokens: 80, outputTokens: 20 },
        }),
      }
    )

    await pikkuAIScoreWorkerFunc({}, job({ scorerName: 'helpfulness' }))

    assert.deepEqual(saved, [
      {
        runId: 'run-1',
        scorerName: 'helpfulness',
        score: 0.5,
        reason: 'Terse.',
        metadata: { judgeModel: 'claude-opus-5', judgeTokens: 100 },
      },
    ])
  })

  test('fails the job when there is nowhere to record the grade, so it is retried rather than lost', async () => {
    pikkuState(null, 'agent', 'scorers').set(
      'brevity',
      pikkuAIScorer({
        name: 'brevity',
        description: 'Shorter is better',
        score: () => ({ score: 1 }),
      })
    )
    pikkuState(null, 'package', 'singletonServices', {} as never)

    await assert.rejects(
      () => pikkuAIScoreWorkerFunc({}, job()),
      /AI run state service not initialized/
    )
  })

  test('fails on a scorer name that resolves to nothing', async () => {
    install(
      pikkuAIScorer({
        name: 'brevity',
        description: 'Shorter is better',
        score: () => ({ score: 1 }),
      })
    )

    await assert.rejects(
      () => pikkuAIScoreWorkerFunc({}, job({ scorerName: 'gone' })),
      /AI scorer not found: gone/
    )
  })
})
