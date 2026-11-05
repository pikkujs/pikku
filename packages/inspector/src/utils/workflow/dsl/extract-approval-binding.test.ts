import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import * as ts from 'typescript'
import type { WorkflowStepMeta } from '@pikku/core/workflow'
import { extractDSLWorkflow } from './extract-dsl-workflow.js'
import { convertDslToGraph } from '../graph/convert-dsl-to-graph.js'
import { deriveWorkflowPlan } from '../derive-workflow-plan.js'
import { validateSingleStepWorkflows } from '../../validate-single-step-workflows.js'
import { ErrorCode } from '../../../error-codes.js'
import type { InspectorLogger, InspectorState } from '../../../types.js'

const checker = {
  getSymbolAtLocation: () => undefined,
  getAliasedSymbol: () => undefined,
  getShorthandAssignmentValueSymbol: () => undefined,
  getTypeAtLocation: () => ({ flags: 0 }),
  typeToString: () => 'null',
  isArrayType: () => false,
} as unknown as ts.TypeChecker

const extract = (body: string) => {
  const file = ts.createSourceFile(
    'wf.ts',
    `const wf = pikkuWorkflowFunc({
      func: async (services, data, { workflow }) => {
        ${body}
      },
    })`,
    ts.ScriptTarget.Latest,
    true
  )
  let node: ts.Node | undefined
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      n.expression.getText() === 'pikkuWorkflowFunc'
    ) {
      node = n
    }
    ts.forEachChild(n, visit)
  }
  visit(file)
  assert.ok(node, 'failed to find the workflow definition')
  return extractDSLWorkflow(node, checker)
}

const stepsOf = (body: string): WorkflowStepMeta[] => {
  const result = extract(body)
  assert.equal(result.status, 'ok', JSON.stringify(result))
  return result.steps ?? []
}

const graphOf = (steps: WorkflowStepMeta[]) =>
  convertDslToGraph('wf', {
    pikkuFuncId: 'wf',
    name: 'wf',
    dsl: true,
    steps,
  })

const single644Warnings = (graph: ReturnType<typeof graphOf>): string[] => {
  const warnings: string[] = []
  const logger = {
    diagnostic: ({ code }: { code: string }) => warnings.push(code),
  } as unknown as InspectorLogger
  const state = {
    workflows: {
      graphMeta: { wf: graph },
      files: new Map([['wf', { path: 'wf.ts' }]]),
      graphFiles: new Map(),
    },
  } as unknown as InspectorState
  validateSingleStepWorkflows(logger, state)
  return warnings
}

const GATE = `const decision = await workflow.approval('Manager sign-off', {
  schema: Decision,
  approvers: 'not-initiator',
  approverScope: 'tests:approve',
})`

describe('an approval gate whose outcome is bound to a variable', () => {
  test('is a step, carrying its policy and the binding', () => {
    const [step] = stepsOf(GATE)
    assert.deepEqual(step, {
      type: 'approval',
      reason: 'Manager sign-off',
      outputVar: 'decision',
      approvers: 'not-initiator',
      approverScope: 'tests:approve',
    })
  })

  test('survives branching on the decision', () => {
    const steps = stepsOf(`${GATE}
      if (decision.status === 'expired') {
        return { outcome: 'expired' }
      }
      if (decision.data.approve) {
        await workflow.do('Start the test', 'startTest', { id: data.id })
      }`)
    assert.deepEqual(
      steps.map((s) => s.type),
      ['approval', 'branch', 'branch']
    )

    const graph = graphOf(steps)
    const first = Object.values(graph.nodes).find((n) =>
      graph.entryNodeIds.includes(n.nodeId)
    )
    assert.equal(first && 'flow' in first ? first.flow : undefined, 'approval')
    assert.deepEqual(
      deriveWorkflowPlan(steps).plannedSteps?.[0]?.stepName,
      '__workflow_approval:Manager sign-off'
    )
  })

  test('feeds a later step through the binding', () => {
    const steps = stepsOf(`${GATE}
      await workflow.do('Record', 'recordDecision', { status: decision.status })`)
    const record = steps[1]
    assert.equal(record.type, 'rpc')
    assert.deepEqual(record.type === 'rpc' && record.inputs, {
      status: { from: 'outputVar', name: 'decision', path: 'status' },
    })
  })

  test('keeps PKU644 quiet on a gate with one step behind it', () => {
    const graph = graphOf(
      stepsOf(`${GATE}
        if (decision.status === 'decided') {
          await workflow.do('Start the test', 'startTest', { id: data.id })
        }`)
    )
    assert.ok(
      !single644Warnings(graph).includes(ErrorCode.SINGLE_STEP_WORKFLOW)
    )
  })

  test('is a step when assigned to a variable declared with a literal', () => {
    const steps = stepsOf(`let decision = null
      decision = await workflow.approval('Manager sign-off', { schema: Decision })`)
    assert.deepEqual(steps, [
      {
        type: 'approval',
        reason: 'Manager sign-off',
        outputVar: 'decision',
      },
    ])
  })

  test('destructuring the outcome is refused rather than losing the gate', () => {
    const result = extract(
      `const { status } = await workflow.approval('Manager sign-off', { schema: Decision })`
    )
    assert.equal(result.status, 'error')
    assert.match(result.reason ?? '', /Destructuring a step result/)
  })
})
