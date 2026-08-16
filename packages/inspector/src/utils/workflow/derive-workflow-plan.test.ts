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
    assert.equal(
      plan.plannedSteps,
      undefined,
      'loop count is runtime-dependent'
    )
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

  test('suspend steps appear in the plan with __workflow_suspend: key and sentence-case displayName', () => {
    const plan = deriveWorkflowPlan([
      rpc('build'),
      { type: 'suspend', reason: 'building' } as WorkflowStepMeta,
      rpc('publish'),
      { type: 'suspend', reason: 'awaiting_approval' } as WorkflowStepMeta,
      { type: 'suspend', reason: 'building-image' } as WorkflowStepMeta,
    ])
    assert.equal(plan.deterministic, true)
    assert.deepEqual(plan.plannedSteps, [
      { stepName: 'build' },
      { stepName: '__workflow_suspend:building', displayName: 'Building' },
      { stepName: 'publish' },
      {
        stepName: '__workflow_suspend:awaiting_approval',
        displayName: 'Awaiting approval',
      },
      {
        stepName: '__workflow_suspend:building-image',
        displayName: 'Building image',
      },
    ])
  })

  test('approval steps appear in the plan with __workflow_approval: key and sentence-case displayName', () => {
    const plan = deriveWorkflowPlan([
      rpc('build'),
      { type: 'approval', reason: 'awaiting_approval' } as WorkflowStepMeta,
      rpc('publish'),
    ])
    assert.equal(plan.deterministic, true)
    assert.deepEqual(plan.plannedSteps, [
      { stepName: 'build' },
      {
        stepName: '__workflow_approval:awaiting_approval',
        displayName: 'Awaiting approval',
      },
      { stepName: 'publish' },
    ])
  })

  test('an approval is namespaced apart from a suspend sharing its reason', () => {
    const plan = deriveWorkflowPlan([
      { type: 'suspend', reason: 'sign_off' } as WorkflowStepMeta,
      { type: 'approval', reason: 'sign_off' } as WorkflowStepMeta,
    ])
    assert.deepEqual(
      plan.plannedSteps.map((s) => s.stepName),
      ['__workflow_suspend:sign_off', '__workflow_approval:sign_off']
    )
  })
})
