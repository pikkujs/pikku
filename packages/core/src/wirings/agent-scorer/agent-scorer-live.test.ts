import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { scoreFinishedRun } from './agent-scorer-live.js'
import { pikkuAgentJudge, pikkuAgentScorer } from './agent-scorer.js'
import type { PikkuAgentScorer, ScorerInput } from './agent-scorer.types.js'

const register = (agentName: string, scorers: PikkuAgentScorer[]) => {
  pikkuState(null, 'agent', 'agents').set(agentName, {
    name: agentName,
    scorers: scorers.map((scorer) => scorer.name),
  } as never)
  for (const scorer of scorers) {
    pikkuState(null, 'agent', 'scorers').set(scorer.name, scorer)
  }
}

const run = (overrides: Partial<ScorerInput> = {}): ScorerInput => ({
  runId: 'run-1',
  agentName: 'assistant',
  threadId: 'thread-1',
  input: 'what is the capital of France?',
  output: 'Paris',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  ...overrides,
})

const collectingServices = () => {
  const added: { queueName: string; data: any }[] = []
  const warnings: string[] = []
  const errors: string[] = []
  return {
    added,
    warnings,
    errors,
    services: {
      logger: {
        warn: (message: string) => warnings.push(message),
        error: (message: string) => errors.push(message),
      },
      queueService: {
        add: async (queueName: string, data: unknown) => {
          added.push({ queueName, data })
          return undefined
        },
      },
    } as any,
  }
}

const alwaysOne = pikkuAgentScorer({
  name: 'brevity',
  description: 'Shorter is better',
  score: () => ({ score: 1 }),
})

describe('scoreFinishedRun', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('sends one message per scorer, each to its own lane', async () => {
    const judge = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })
    register('assistant', [alwaysOne, judge])
    const { added, services } = collectingServices()

    await scoreFinishedRun(run(), services)

    assert.deepEqual(
      added.map((entry) => [entry.queueName, entry.data.scorerName]),
      [
        ['agent-score-fast', 'brevity'],
        ['agent-score-slow', 'helpfulness'],
      ]
    )
  })

  test('never grades a reference-based judge, because live traffic has no answer key', async () => {
    const correctness = pikkuAgentJudge({
      name: 'correctness',
      description: 'Is the answer right',
      model: 'claude-opus-5',
      goal: 'Grade correctness.',
      requiresReference: true,
    })
    register('assistant', [correctness])
    const { added, services } = collectingServices()

    await scoreFinishedRun(run(), services)

    assert.deepEqual(added, [])
  })

  test('honours the sample rate rather than grading every run', async () => {
    const sampled = pikkuAgentScorer({
      name: 'brevity',
      description: 'Shorter is better',
      sampleRate: 0,
      score: () => ({ score: 1 }),
    })
    register('assistant', [sampled])
    const { added, services } = collectingServices()

    await scoreFinishedRun(run(), services)

    assert.deepEqual(added, [])
  })

  test('warns about a scorer the agent named but nothing registered, rather than failing the run', async () => {
    pikkuState(null, 'agent', 'agents').set('assistant', {
      name: 'assistant',
      scorers: ['nonexistent'],
    } as never)
    const { added, warnings, services } = collectingServices()

    await scoreFinishedRun(run(), services)

    assert.deepEqual(added, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /nonexistent/)
  })

  test('says why nothing was graded when there is no queue to grade on', async () => {
    register('assistant', [alwaysOne])
    const { warnings, services } = collectingServices()
    delete services.queueService

    await scoreFinishedRun(run(), services)

    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /no queue service is registered/)
  })

  test('one scorer that cannot be enqueued does not stop the others', async () => {
    const judge = pikkuAgentJudge({
      name: 'helpfulness',
      description: 'Is the answer useful',
      model: 'claude-opus-5',
      goal: 'Grade helpfulness.',
    })
    register('assistant', [alwaysOne, judge])
    const { added, errors, services } = collectingServices()
    const add = services.queueService.add
    services.queueService.add = async (queueName: string, data: any) => {
      if (data.scorerName === 'brevity') throw new Error('queue is down')
      return add(queueName, data)
    }

    await scoreFinishedRun(run(), services)

    assert.deepEqual(
      added.map((entry) => entry.data.scorerName),
      ['helpfulness']
    )
    assert.equal(errors.length, 1)
  })

  test('an agent that names no scorers touches the queue at all', async () => {
    pikkuState(null, 'agent', 'agents').set('assistant', {
      name: 'assistant',
    } as never)
    const { added, services } = collectingServices()

    await scoreFinishedRun(run(), services)

    assert.deepEqual(added, [])
  })
})
