import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import type { WorkflowStepMeta } from '@pikku/core/workflow'
import { deriveWorkflowPlan } from './derive-workflow-plan.js'

const rpc = (stepName: string, rpcName = 'rpc.fn'): WorkflowStepMeta =>
  ({ type: 'rpc', stepName, rpcName }) as WorkflowStepMeta
const sleep = (stepName: string): WorkflowStepMeta =>
  ({ type: 'sleep', stepName }) as WorkflowStepMeta
const inline = (stepName: string): WorkflowStepMeta =>
  ({ type: 'inline', stepName }) as WorkflowStepMeta

describe('deriveWorkflowPlan', () => {
  test('linear workflow is deterministic with every step listed in order', () => {
    const plan = deriveWorkflowPlan([rpc('a'), sleep('b'), inline('c')])
    assert.equal(plan.deterministic, true)
    assert.deepEqual(plan.plannedSteps, [
      { stepName: 'a' },
      { stepName: 'b' },
      { stepName: 'c' },
    ])
  })

  test('parallel group lists each child step', () => {
    const plan = deriveWorkflowPlan([
      rpc('a'),
      {
        type: 'parallel',
        children: [rpc('p1'), rpc('p2')],
      } as WorkflowStepMeta,
    ])
    assert.equal(plan.deterministic, true)
    assert.deepEqual(plan.plannedSteps, [
      { stepName: 'a' },
      { stepName: 'p1' },
      { stepName: 'p2' },
    ])
  })

  test('branch is loopless: plannedSteps cover every arm but not deterministic', () => {
    const plan = deriveWorkflowPlan([
      rpc('start'),
      {
        type: 'branch',
        branches: [{ condition: 'x', steps: [rpc('left')] }],
        elseSteps: [rpc('right')],
      } as WorkflowStepMeta,
      rpc('end'),
    ])
    assert.equal(plan.deterministic, false, 'a branch picks a path at runtime')
    assert.deepEqual(plan.plannedSteps, [
      { stepName: 'start' },
      { stepName: 'left' },
      { stepName: 'right' },
      { stepName: 'end' },
    ])
  })

  test('switch is loopless: cases + default contribute steps, not deterministic', () => {
    const plan = deriveWorkflowPlan([
      {
        type: 'switch',
        expression: 'kind',
        cases: [{ steps: [rpc('caseA')] }, { steps: [rpc('caseB')] }],
        defaultSteps: [rpc('fallback')],
      } as WorkflowStepMeta,
    ])
    assert.equal(plan.deterministic, false)
    assert.deepEqual(plan.plannedSteps, [
      { stepName: 'caseA' },
      { stepName: 'caseB' },
      { stepName: 'fallback' },
    ])
  })

  test('fanout (loop) yields no plannedSteps and is not deterministic', () => {
    const plan = deriveWorkflowPlan([
      rpc('before'),
      {
        type: 'fanout',
        stepName: 'each',
        child: rpc('child'),
        mode: 'parallel',
      } as WorkflowStepMeta,
    ])
    assert.equal(plan.deterministic, false)
    assert.equal(plan.plannedSteps, undefined, 'loop count is runtime-dependent')
  })

  test('a fanout nested inside a branch still suppresses the plan', () => {
    const plan = deriveWorkflowPlan([
      {
        type: 'branch',
        branches: [
          {
            condition: 'x',
            steps: [
              {
                type: 'fanout',
                stepName: 'each',
                child: rpc('child'),
                mode: 'serial',
              } as WorkflowStepMeta,
            ],
          },
        ],
      } as WorkflowStepMeta,
    ])
    assert.equal(plan.deterministic, false)
    assert.equal(plan.plannedSteps, undefined)
  })

  test('non-named steps (set/return/cancel) are skipped', () => {
    const plan = deriveWorkflowPlan([
      { type: 'set' } as WorkflowStepMeta,
      rpc('a'),
      { type: 'return' } as WorkflowStepMeta,
    ])
    assert.equal(plan.deterministic, true)
    assert.deepEqual(plan.plannedSteps, [{ stepName: 'a' }])
  })
})
