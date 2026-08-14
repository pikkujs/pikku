import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  enableScoreSnapshots,
  getScoreSnapshot,
  recordScoreSnapshot,
  resetScoreSnapshots,
} from './agent-scorer-snapshots.js'
import type { ScorerInput } from './agent-scorer.types.js'

const run = (runId: string): ScorerInput => ({
  runId,
  agentName: 'assistant',
  input: 'Where is Paris?',
  output: 'France.',
  toolCalls: [],
  usage: { inputTokens: 5, outputTokens: 2 },
})

describe('score snapshots', () => {
  beforeEach(() => resetScoreSnapshots())

  test('a process that was never asked to retain runs holds none', () => {
    recordScoreSnapshot(run('run-1'))

    assert.equal(getScoreSnapshot('run-1'), undefined)
  })

  test('a retained run is handed back whole, so a grade sees what live scoring saw', () => {
    enableScoreSnapshots()

    recordScoreSnapshot(run('run-1'))

    assert.deepEqual(getScoreSnapshot('run-1'), run('run-1'))
  })

  test('the buffer is bounded, so a long-lived dev server cannot accumulate run content', () => {
    enableScoreSnapshots(2)

    recordScoreSnapshot(run('run-1'))
    recordScoreSnapshot(run('run-2'))
    recordScoreSnapshot(run('run-3'))

    assert.equal(getScoreSnapshot('run-1'), undefined)
    assert.equal(getScoreSnapshot('run-2')?.runId, 'run-2')
    assert.equal(getScoreSnapshot('run-3')?.runId, 'run-3')
  })
})
