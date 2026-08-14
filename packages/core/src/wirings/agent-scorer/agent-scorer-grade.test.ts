import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { gradeRun } from './agent-scorer-grade.js'
import { pikkuAgentJudge, pikkuAgentScorer } from './agent-scorer.js'
import type { ScoreJob } from './agent-scorer.types.js'

const job = (overrides: Partial<ScoreJob> = {}): ScoreJob => ({
  scorerName: 'correctness',
  runId: 'run-1',
  agentName: 'assistant',
  input: 'what is the capital of France?',
  output: 'Paris',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  ...overrides,
})

describe('gradeRun', () => {
  beforeEach(() => resetPikkuState())

  test('a scenario grade is returned and not written to the live record', async () => {
    pikkuState(null, 'agent', 'scorers').set(
      'correctness',
      pikkuAgentScorer({
        name: 'correctness',
        description: 'Matches the answer key',
        requiresReference: true,
        score: (input) => ({
          score: input.output === input.reference ? 1 : 0,
        }),
      })
    )
    let saves = 0

    const result = await gradeRun(
      job({ reference: 'Paris' }),
      {
        agentRunState: {
          saveScore: async () => {
            saves++
          },
        },
      },
      { persist: false }
    )

    assert.deepEqual(result, { score: 1 })
    assert.equal(saves, 0)
  })

  test('a reference-based scorer sees the answer key it was given', async () => {
    pikkuState(null, 'agent', 'scorers').set(
      'correctness',
      pikkuAgentScorer({
        name: 'correctness',
        description: 'Matches the answer key',
        requiresReference: true,
        score: (input) => ({
          score: input.output === input.reference ? 1 : 0,
        }),
      })
    )

    const result = await gradeRun(
      job({ reference: 'Lyon' }),
      {},
      {
        persist: false,
      }
    )

    assert.equal(result.score, 0)
  })

  test('a judge grades without a score function, and reports the model it used', async () => {
    pikkuState(null, 'agent', 'scorers').set(
      'helpfulness',
      pikkuAgentJudge({
        name: 'helpfulness',
        description: 'Is the answer useful',
        model: 'claude-opus-5',
        goal: 'Grade helpfulness.',
      })
    )

    const result = await gradeRun(
      job({ scorerName: 'helpfulness' }),
      {
        agentRunner: {
          run: async () => ({
            object: { score: 0.75, reason: 'Correct but terse.' },
            usage: { inputTokens: 80, outputTokens: 20 },
          }),
        },
      },
      { persist: false }
    )

    assert.equal(result.score, 0.75)
    assert.deepEqual(result.metadata, {
      judgeModel: 'claude-opus-5',
      judgeTokens: 100,
    })
  })
})
