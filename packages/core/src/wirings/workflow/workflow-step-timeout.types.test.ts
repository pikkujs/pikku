import { describe, test } from 'node:test'
import type {
  PikkuScenarioWire,
  RpcStepMeta,
} from './dsl/workflow-dsl.types.js'

/** Never called: the assertions here are the ones the type checker makes. */
const steps = (workflow: PikkuScenarioWire) => [
  () => workflow.do('rpc', 'fn', {}, { timeout: '30s' }),
  () => workflow.do('rpc', 'fn', {}, { timeout: 30_000 }),
  () => workflow.do('closure', async () => 1, { retries: 1 }),
  () => workflow.expectEventually('poll', 'fn', {}, Boolean, { within: '1s' }),
  () => workflow.expectError('error', 'fn', {}, { matches: 'boom' }),
  // @ts-expect-error a closure step takes no timeout
  () => workflow.do('closure', async () => 1, { timeout: '30s' }),
  // @ts-expect-error an expect step takes no timeout
  () => workflow.expectEventually('poll', 'fn', {}, Boolean, { timeout: '1s' }),
  // @ts-expect-error an expect step takes no timeout
  () => workflow.expectError('error', 'fn', {}, { timeout: '1s' }),
]

const extracted: RpcStepMeta = {
  type: 'rpc',
  stepName: 'rpc',
  rpcName: 'fn',
  options: { timeout: '30s' },
}

describe('a step timeout', () => {
  test('is accepted by the RPC form of do alone', () => {
    void steps
    void extracted
  })
})
