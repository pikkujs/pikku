import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { markWorkflowStep, workflowStepOfTrace } from './workflow-step-mark.js'
import { childTraceWire, createTrace } from './trace.js'

describe('workflow step mark', () => {
  test('a marked trace reads back its run and step', () => {
    const trace = createTrace()
    markWorkflowStep(trace, { runId: 'run-1', stepId: 'step-1' })
    assert.deepEqual(workflowStepOfTrace(trace), {
      runId: 'run-1',
      stepId: 'step-1',
    })
  })

  test('an unmarked trace has no step', () => {
    assert.equal(workflowStepOfTrace(createTrace()), undefined)
  })

  test('a copy of the trace, and a child of it, are not the step', () => {
    const trace = createTrace()
    markWorkflowStep(trace, { runId: 'run-1', stepId: 'step-1' })
    assert.equal(workflowStepOfTrace({ ...trace }), undefined)
    assert.equal(workflowStepOfTrace(childTraceWire(trace).trace), undefined)
  })

  test('marking again replaces the step for that trace', () => {
    const trace = createTrace()
    markWorkflowStep(trace, { runId: 'run-1', stepId: 'a' })
    markWorkflowStep(trace, { runId: 'run-1', stepId: 'b' })
    assert.equal(workflowStepOfTrace(trace)?.stepId, 'b')
  })
})
