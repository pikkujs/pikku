import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createScenarioRunner } from './pikku-scenario-service.js'
import type { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import type { ScenarioActor } from '../../services/scenario-actors-service.js'

const noopLogger = { error() {}, info() {}, warn() {}, debug() {} }

const fakeActor = (
  name: string,
  handler: (rpcName: string, data: unknown) => Promise<unknown>
): ScenarioActor => ({
  name,
  email: `${name}@actors.local`,
  invoke: async (rpcName: string, data: unknown) => handler(rpcName, data),
  invokeRaw: async (rpcName: string, data: unknown) => ({
    status: 200,
    ok: true,
    body: await handler(rpcName, data),
  }),
})

const setup = async (ws: InMemoryWorkflowService) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: noopLogger,
  } as any)
  const runId = await ws.createRun('scenarioTest', {}, true, 'hash', {
    type: 'test',
  } as any)
  ws.registerInlineRun(runId)
  return runId
}

/**
 * The scenario wire, wrapped rather than returned directly: it carries a
 * `then` — the Gherkin phase, not a promise — so awaiting one is awaiting a
 * thenable, and the runtime calls it as a step.
 */
const scenarioWire = async (rpcService: any = {}): Promise<{ wire: any }> => {
  const { workflowService } = createScenarioRunner()
  const ws = workflowService as InMemoryWorkflowService
  const runId = await setup(ws)
  return { wire: ws.createWorkflowWire('scenarioTest', runId, rpcService) }
}

describe('workflow.expectError', () => {
  beforeEach(() => resetPikkuState())

  test('returns the message when the call throws as expected', async () => {
    const intruder = fakeActor('intruder', async () => {
      throw new Error('Forbidden: not your todo')
    })
    const { wire } = await scenarioWire()

    const message = await wire.expectError(
      'intruder cannot delete',
      'deleteTodo',
      { todoId: 't1' },
      { actor: intruder }
    )

    assert.equal(message, 'Forbidden: not your todo')
  })

  test('fails when the call succeeds instead of throwing', async () => {
    const { wire } = await scenarioWire({
      rpcWithWire: async () => ({ deleted: true }),
    })

    await assert.rejects(
      wire.expectError('should have failed', 'deleteTodo', {}, { retries: 0 }),
      /expected an error but the call succeeded/
    )
  })

  test('fails when the error message does not match', async () => {
    const { wire } = await scenarioWire({
      rpcWithWire: async () => {
        throw new Error('database offline')
      },
    })

    await assert.rejects(
      wire.expectError(
        'wrong reason',
        'deleteTodo',
        {},
        { matches: /Forbidden/, retries: 0 }
      ),
      /did not match .*database offline/
    )
  })
})

describe('workflow.expectService', () => {
  beforeEach(() => resetPikkuState())

  const stubCalls = (
    calls: Array<{ service: string; method: string; args: unknown[] }>
  ) => ({
    rpcWithWire: async (rpcName: string) => {
      assert.equal(rpcName, 'pikkuScenarioGetStubCalls')
      return calls
    },
  })

  const oneEmail = () =>
    stubCalls([{ service: 'email', method: 'send', args: [{ to: 'a@b.c' }] }])

  test('passes when the service method was called', async () => {
    const { wire } = await scenarioWire(oneEmail())

    await wire.expectService('an email went out', 'email.send')
  })

  test('a call count that does not match names what was recorded', async () => {
    const { wire } = await scenarioWire(oneEmail())

    await assert.rejects(
      wire.expectService('two emails', 'email.send', {
        times: 2,
        retries: 0,
      }),
      /expected 2 call\(s\).*found 1.*email\.send/s
    )
  })

  test('calledWith matches on the first argument', async () => {
    const { wire } = await scenarioWire(oneEmail())

    await wire.expectService('emailed the customer', 'email.send', {
      calledWith: { to: 'a@b.c' },
    })
    await assert.rejects(
      wire.expectService('emailed someone else', 'email.send', {
        calledWith: { to: 'x@y.z' },
        retries: 0,
      }),
      /found 0/
    )
  })

  test('a name that is not service.method is rejected outright', async () => {
    const { wire } = await scenarioWire(stubCalls([]))

    await assert.rejects(
      wire.expectService('bad name', 'emailsend'),
      /needs 'service\.method'/
    )
  })
})
