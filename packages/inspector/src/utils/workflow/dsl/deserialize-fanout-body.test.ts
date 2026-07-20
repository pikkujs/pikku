import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { deserializeDslWorkflow } from './deserialize-dsl-workflow.js'

/**
 * A fanout whose per-iteration body is two chained steps: the first captures
 * its result into `digestData`, the second consumes it.
 */
const MULTI_STEP_FANOUT_GRAPH: any = {
  name: 'dailyDigestWorkflow',
  pikkuFuncId: 'dailyDigestWorkflow',
  source: 'dsl',
  entryNodeIds: ['start'],
  nodes: {
    start: {
      nodeId: 'start',
      flow: 'fanout',
      sourceVar: 'users',
      itemVar: 'u',
      mode: 'parallel',
      childEntry: 'start_item_0',
    },
    start_item_0: {
      nodeId: 'start_item_0',
      rpcName: 'getDigestData',
      stepName: 'Get pipeline',
      outputVar: 'digestData',
      input: { userId: { $ref: 'u.id' } },
      next: 'start_item_1',
    },
    start_item_1: {
      nodeId: 'start_item_1',
      rpcName: 'sendDigestEmail',
      stepName: 'Send digest',
      input: { dealsByStage: { $ref: 'digestData.dealsByStage' } },
    },
  },
}

describe('deserializeDslWorkflow — multi-step fanout body', () => {
  test('emits every step in the map body, not just the entry step', () => {
    const code = deserializeDslWorkflow(MULTI_STEP_FANOUT_GRAPH)

    assert.ok(
      code.includes("'getDigestData'"),
      'the entry step of the body should be emitted'
    )
    assert.ok(
      code.includes("'sendDigestEmail'"),
      'steps chained after the entry step must not be dropped'
    )
  })

  test('re-emits a captured step result as a `const` binding', () => {
    const code = deserializeDslWorkflow(MULTI_STEP_FANOUT_GRAPH)

    assert.ok(
      code.includes('const digestData = await workflow.do('),
      `a step with an outputVar should round-trip as a const binding, got:\n${code}`
    )
  })

  test('uses a block-bodied map callback so multiple statements are valid', () => {
    const code = deserializeDslWorkflow(MULTI_STEP_FANOUT_GRAPH)

    assert.ok(
      code.includes('users.map(async (u) => {'),
      `map callback must be block-bodied, got:\n${code}`
    )
  })
})
