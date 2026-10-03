import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  workflowQueryKeys,
  isRunActive,
  isStepActive,
  hasActiveStep,
} from './workflow-query-keys.js'

describe('workflowQueryKeys', () => {
  // These tuples are a published contract: an embedder shares this package's
  // QueryClient and invalidates against them. Renaming one silently stops the
  // host's refreshes from reaching the panels, with no type error anywhere —
  // so the shapes are pinned here rather than left to a rename to discover.
  test('pins the key tuples hosts invalidate against', () => {
    assert.deepEqual(workflowQueryKeys.meta('wf-1'), [
      'workflow-meta-by-id',
      'wf-1',
    ])
    assert.deepEqual(workflowQueryKeys.runs('wf-1', 'running'), [
      'workflow-runs',
      'wf-1',
      'running',
    ])
    assert.deepEqual(workflowQueryKeys.allRuns(), ['workflow-runs'])
    assert.deepEqual(workflowQueryKeys.run('run-1'), ['workflow-run', 'run-1'])
    assert.deepEqual(workflowQueryKeys.runSteps('run-1'), [
      'workflow-run-steps',
      'run-1',
    ])
    assert.deepEqual(workflowQueryKeys.runHistory('run-1'), [
      'workflow-run-history',
      'run-1',
    ])
    assert.deepEqual(workflowQueryKeys.version('wf-1', 'abc'), [
      'workflow-version',
      'wf-1',
      'abc',
    ])
    assert.deepEqual(workflowQueryKeys.runNames(), ['workflow-run-names'])
  })

  test('allRuns is a prefix of runs, so it invalidates every variant', () => {
    const specific = workflowQueryKeys.runs('wf-1', 'running')
    const all = workflowQueryKeys.allRuns()
    assert.deepEqual(specific.slice(0, all.length), [...all])
  })
})

describe('run status predicates', () => {
  test('classifies runs the way the panels poll on', () => {
    assert.equal(isRunActive('running'), true)
    assert.equal(isRunActive('completed'), false)
    assert.equal(isRunActive('failed'), false)
    assert.equal(isRunActive(undefined), false)
  })

  test('classifies steps the way the panels poll on', () => {
    assert.equal(isStepActive('running'), true)
    assert.equal(isStepActive('pending'), true)
    assert.equal(isStepActive('completed'), false)
    assert.equal(isStepActive(undefined), false)
  })

  test('hasActiveStep is true when any single step is still in flight', () => {
    assert.equal(
      hasActiveStep([{ status: 'completed' }, { status: 'pending' }]),
      true
    )
    assert.equal(
      hasActiveStep([{ status: 'completed' }, { status: 'failed' }]),
      false
    )
    assert.equal(hasActiveStep([]), false)
    assert.equal(hasActiveStep(undefined), false)
  })
})
