import { describe, test } from 'node:test'
import type { PikkuWorkflowWire } from './dsl/workflow-dsl.types.js'

/** Never called: the assertions here are the ones the type checker makes. */
const steps = (workflow: PikkuWorkflowWire) => [
  () => workflow.do('rpc', 'fn', {}, { timeout: '30s' }),
  () => workflow.do('rpc', 'fn', {}, { timeout: 30_000 }),
  // @ts-expect-error a closure step takes no timeout
  () => workflow.do('closure', async () => 1, { timeout: '30s' }),
  // @ts-expect-error an expect step takes no timeout
  () => workflow.expectEventually('poll', 'fn', {}, Boolean, { timeout: '1s' }),
  // @ts-expect-error an expect step takes no timeout
  () => workflow.expectError('error', 'fn', {}, { timeout: '1s' }),
]

describe('a step timeout', () => {
  test('is accepted by the RPC form of do alone', () => {
    void steps
  })
})
