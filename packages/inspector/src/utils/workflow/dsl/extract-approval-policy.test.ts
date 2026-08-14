import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import * as ts from 'typescript'
import { extractDSLWorkflow } from './extract-dsl-workflow.js'
import type { ApprovalStepMeta } from '@pikku/core/ecosystem/workflow'

const checker = {
  getSymbolAtLocation: () => undefined,
  getAliasedSymbol: () => undefined,
  getShorthandAssignmentValueSymbol: () => undefined,
  getTypeAtLocation: () => undefined,
} as unknown as ts.TypeChecker

/** Extracts the single approval step from a workflow body. */
const approvalStepFor = (options: string): ApprovalStepMeta => {
  const file = ts.createSourceFile(
    'wf.ts',
    `const wf = pikkuWorkflowFunc({
      func: async (services, data, { workflow }) => {
        await workflow.approval('Release funds', ${options})
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

  const result = extractDSLWorkflow(node, checker)
  assert.equal(result.status, 'ok', JSON.stringify(result))
  const step = result.steps?.find(
    (s): s is ApprovalStepMeta => s.type === 'approval'
  )
  assert.ok(step, 'no approval step was extracted')
  return step
}

describe('an approval gate carries its policy into the graph', () => {
  test('approvers and approverScope survive extraction', () => {
    const step = approvalStepFor(
      `{ schema: DecisionSchema, approvers: 'not-initiator', approverScope: 'payments:approve' }`
    )
    assert.equal(step.approvers, 'not-initiator')
    assert.equal(step.approverScope, 'payments:approve')
  })

  test('expiry still survives alongside them', () => {
    const step = approvalStepFor(
      `{ schema: DecisionSchema, expiry: '3d', approvers: 'owner' }`
    )
    assert.equal(step.expiry, '3d')
    assert.equal(step.approvers, 'owner')
  })

  test('a gate declaring no policy records none', () => {
    const step = approvalStepFor(`{ schema: DecisionSchema }`)
    assert.equal(step.approvers, undefined)
    assert.equal(step.approverScope, undefined)
  })
})
