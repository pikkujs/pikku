import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { createScenarioRunner } from './pikku-scenario-service.js'
import type { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import type { ScenarioPersona } from '../../services/personas-service.js'

const noopLogger = { error() {}, info() {}, warn() {}, debug() {} }

const fakeActor = (
  name: string,
  handler: (rpcName: string, data: unknown) => Promise<unknown>
): ScenarioPersona => ({
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
      wire.expectError('should have failed', 'deleteTodo', {}),
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
        { matches: /Forbidden/ }
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
      wire.expectService('two emails', 'email.send', { times: 2 }),
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

describe('workflow.expectScore', () => {
  beforeEach(() => resetPikkuState())

  const grades = (grade: { score: number; reason?: string }) => ({
    rpcWithWire: async (rpcName: string, data: any) => {
      assert.equal(rpcName, 'pikkuScenarioGradeRun')
      assert.equal(data.runId, 'run-1')
      return grade
    },
  })

  test('returns the grade when the score clears the bound', async () => {
    const { wire } = await scenarioWire(grades({ score: 0.9 }))

    const grade = await wire.expectScore('was brief', 'run-1', 'brevity', {
      atLeast: 0.8,
    })

    assert.equal(grade.score, 0.9)
  })

  test('a scorer that graded zero fails without a bound being stated', async () => {
    const { wire } = await scenarioWire(grades({ score: 0 }))

    await assert.rejects(
      wire.expectScore('was brief', 'run-1', 'brevity'),
      /expected 'brevity' to grade run run-1 at least 0\.5, got 0/
    )
  })

  test('the failure carries the reason the judge gave', async () => {
    const { wire } = await scenarioWire(
      grades({ score: 0.2, reason: 'It rambled for four paragraphs' })
    )

    await assert.rejects(
      wire.expectScore('was brief', 'run-1', 'brevity', { atLeast: 0.8 }),
      /It rambled for four paragraphs/
    )
  })

  test('atMost fails a score that is too high', async () => {
    const { wire } = await scenarioWire(grades({ score: 0.95 }))

    await assert.rejects(
      wire.expectScore('was not sycophantic', 'run-1', 'sycophancy', {
        atLeast: 0,
        atMost: 0.3,
      }),
      /between 0 and 0\.3, got 0\.95/
    )
  })

  test('a grade that misses the bound is not re-rolled until it lands', async () => {
    let graded = 0
    const { wire } = await scenarioWire({
      rpcWithWire: async () => {
        graded += 1
        return { score: 1 }
      },
    })

    await assert.rejects(
      wire.expectScore('was not sycophantic', 'run-1', 'sycophancy', {
        atLeast: 0,
        atMost: 0.3,
      }),
      /got 1/
    )

    // The whole point of a judge is that it is not deterministic. Six attempts
    // at it is six chances for one to land inside the band, which grades the
    // sampling rather than the run.
    assert.equal(graded, 1)
  })

  test('a reference answer reaches the grader', async () => {
    let seen: any
    const { wire } = await scenarioWire({
      rpcWithWire: async (_rpcName: string, data: any) => {
        seen = data
        return { score: 1 }
      },
    })

    await wire.expectScore('matched the answer key', 'run-1', 'correctness', {
      reference: 'Paris',
    })

    assert.equal(seen.reference, 'Paris')
    assert.equal(seen.scorer, 'correctness')
  })
})
