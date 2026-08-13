import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { StandardSchemaV1 } from '@standard-schema/spec'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import { pikkuState } from '../../pikku-state.js'
import { addWorkflow } from './dsl/workflow-runner.js'
import { WorkflowSuspendedException } from './workflow-errors.js'
import {
  approvalPolicyRefusal,
  WorkflowApprovalForbiddenError,
} from './workflow-approval-policy.js'
import { approvalStateKey, approvalStepNameFor } from './workflow-approval.js'
import type {
  PikkuWorkflowWire,
  WorkflowApprovalOptions,
} from './workflow.types.js'

const anySchema: StandardSchemaV1<unknown, unknown> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value }),
  },
}

const registerApprovalWorkflow = (
  workflowName: string,
  graphHash: string,
  options: Omit<WorkflowApprovalOptions, 'schema'>,
  audit?: { audit: (event: unknown) => Promise<void> }
) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
    queueService: { add: async () => {} },
    audit,
  } as any)

  const metaState = pikkuState(null, 'workflows', 'meta')
  metaState[workflowName] = {
    name: workflowName,
    pikkuFuncId: workflowName,
    source: 'dsl',
    graphHash,
  }
  const functionMetaState = pikkuState(null, 'function', 'meta')
  functionMetaState[workflowName] = {
    name: workflowName,
    sessionless: true,
    permissions: [],
  } as any

  addWorkflow(workflowName, {
    func: async (
      _services: any,
      _data: any,
      { workflow }: { workflow: PikkuWorkflowWire }
    ) => {
      const decision = await workflow.approval('Release funds', {
        schema: anySchema,
        ...options,
      })
      return { decision }
    },
  })

  return () => {
    delete metaState[workflowName]
    delete functionMetaState[workflowName]
    pikkuState(null, 'workflows', 'registrations').delete(workflowName)
  }
}

/** Run until the gate suspends, so the gate has published its policy. */
const runToGate = async (ws: InMemoryWorkflowService, runId: string) => {
  await assert.rejects(
    ws.runWorkflowJob(runId, {}),
    (error: unknown) => error instanceof WorkflowSuspendedException
  )
}

describe('approval policy', () => {
  test('the default lets anyone the entrypoint admitted answer', () => {
    assert.equal(approvalPolicyRefusal({}, 'owner', undefined), undefined)
    assert.equal(
      approvalPolicyRefusal({}, 'owner', { userId: 'someone-else' }),
      undefined
    )
  })

  test('owner admits only the user who started the run', () => {
    const policy = { approvers: 'owner' as const }
    assert.equal(
      approvalPolicyRefusal(policy, 'owner', { userId: 'owner' }),
      undefined
    )
    assert.match(
      approvalPolicyRefusal(policy, 'owner', { userId: 'other' })!,
      /Only the user who started this run/
    )
    assert.match(
      approvalPolicyRefusal(policy, 'owner', undefined)!,
      /Only the user who started this run/
    )
  })

  test('a run with no initiator has no owner to compare against', () => {
    assert.equal(
      approvalPolicyRefusal({ approvers: 'owner' }, undefined, {
        userId: 'anyone',
      }),
      undefined
    )
  })

  test('not-initiator excludes the user who started the run', () => {
    const policy = { approvers: 'not-initiator' as const }
    assert.match(
      approvalPolicyRefusal(policy, 'owner', { userId: 'owner' })!,
      /may not answer/
    )
    assert.equal(
      approvalPolicyRefusal(policy, 'owner', { userId: 'reviewer' }),
      undefined
    )
  })

  test('not-initiator still requires a signed-in decider on an unowned run', () => {
    assert.match(
      approvalPolicyRefusal({ approvers: 'not-initiator' }, undefined, {})!,
      /requires a signed-in user/
    )
  })

  test('approverScope is required on top of the approvers rule', () => {
    const policy = { approvers: 'not-initiator' as const, approverScope: 'sre' }
    assert.match(
      approvalPolicyRefusal(policy, 'owner', { userId: 'reviewer' })!,
      /requires the 'sre' scope/
    )
    assert.equal(
      approvalPolicyRefusal(policy, 'owner', {
        userId: 'reviewer',
        scopes: ['sre'],
      }),
      undefined
    )
    assert.match(
      approvalPolicyRefusal(policy, 'owner', {
        userId: 'owner',
        scopes: ['sre'],
      })!,
      /may not answer/
    )
  })
})

describe('approval policy enforcement', () => {
  test('a gate with no declared policy accepts a caller who does not own the run', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('openGate', 'open-gate', {})

    const runId = await ws.createRun('openGate', {}, false, 'open-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)

    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'someone-else',
    })
    await ws.runWorkflowJob(runId, {})

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    cleanup()
  })

  test('a four-eyes gate refuses the initiator and admits a second user', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('fourEyes', 'four-eyes', {
      approvers: 'not-initiator',
    })

    const runId = await ws.createRun('fourEyes', {}, false, 'four-eyes', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)

    await assert.rejects(
      ws.approveStep(runId, 'Release funds', { ok: true }, {
        userId: 'initiator',
      }),
      WorkflowApprovalForbiddenError
    )

    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'reviewer',
    })
    await ws.runWorkflowJob(runId, {})

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    cleanup()
  })

  test('an owner-only gate refuses a caller who did not start the run', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('ownerGate', 'owner-gate', {
      approvers: 'owner',
    })

    const runId = await ws.createRun('ownerGate', {}, false, 'owner-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)

    await assert.rejects(
      ws.approveStep(runId, 'Release funds', { ok: true }, {
        userId: 'attacker',
      }),
      WorkflowApprovalForbiddenError
    )

    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'initiator',
    })
    await ws.runWorkflowJob(runId, {})

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    cleanup()
  })

  test('a scoped gate refuses a decider without the scope', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('scopedGate', 'scoped-gate', {
      approverScope: 'payments:approve',
    })

    const runId = await ws.createRun('scopedGate', {}, false, 'scoped-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)

    await assert.rejects(
      ws.approveStep(runId, 'Release funds', { ok: true }, {
        userId: 'reviewer',
        scopes: ['payments:read'],
      }),
      WorkflowApprovalForbiddenError
    )

    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'reviewer',
      scopes: ['payments:approve'],
    })
    await ws.runWorkflowJob(runId, {})

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    cleanup()
  })

  /**
   * Run state is where a decision waits, not where it is kept: the record is
   * overwritten by the next write to that key and cleared outright whenever a
   * decision is refused. Four-eyes exists to be audited, so who signed and when
   * has to reach the step result, which is append-only and carried into
   * workflowStepHistory.
   */
  test('the decider and the moment reach the step result, not just run state', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('signedGate', 'signed-gate', {
      approvers: 'not-initiator',
    })

    const runId = await ws.createRun('signedGate', {}, false, 'signed-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)

    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'reviewer',
      scopes: ['payments:approve'],
    })
    await ws.runWorkflowJob(runId, {})

    const step = await ws.getStepState(
      runId,
      approvalStepNameFor('Release funds')
    )
    const outcome = step.result as {
      status: string
      decidedBy?: { userId?: string; scopes?: string[] }
      decidedAt?: string
    }

    assert.equal(outcome.status, 'decided')
    assert.equal(outcome.decidedBy?.userId, 'reviewer')
    assert.deepEqual(outcome.decidedBy?.scopes, ['payments:approve'])
    assert.ok(
      outcome.decidedAt && !Number.isNaN(Date.parse(outcome.decidedAt)),
      'decidedAt is an ISO timestamp'
    )

    cleanup()
  })

  test('an expired gate has nobody to record', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('expiredGate', 'expired-gate', {
      expiry: 100,
    })

    const runId = await ws.createRun('expiredGate', {}, false, 'expired-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)
    await new Promise((resolve) => setTimeout(resolve, 150))
    await ws.runWorkflowJob(runId, {})

    const step = await ws.getStepState(
      runId,
      approvalStepNameFor('Release funds')
    )
    assert.deepEqual(step.result, { status: 'expired' })

    cleanup()
  })

  test('a decision recorded before the run reaches the gate is still judged', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('earlyGate', 'early-gate', {
      approvers: 'not-initiator',
    })

    const runId = await ws.createRun('earlyGate', {}, false, 'early-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })

    // The gate has not been reached, so no policy has been published and the
    // submission cannot be judged here — it is accepted and judged on replay.
    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'initiator',
    })

    await runToGate(ws, runId)

    const stateKey = approvalStateKey(approvalStepNameFor('Release funds'))
    const record = (await ws.getRunState(runId))[stateKey] as {
      decision?: unknown
      error?: Array<{ message: string }>
    }
    assert.equal(record.decision, undefined, 'the decision was cleared')
    assert.match(record.error?.[0]?.message ?? '', /may not answer/)
    assert.equal((await ws.getRun(runId))?.status, 'suspended')

    cleanup()
  })
})

/**
 * The step result is deleted with the run — `deleteRun` cascades to steps and
 * to history — and a refused attempt never reaches a step at all. An approval
 * is asked for so it can be answered for afterwards, so it also goes to the
 * audit sink, which holds no foreign key to the run.
 */
describe('approval audit trail', () => {
  const collectingAudit = () => {
    const events: any[] = []
    return {
      events,
      sink: { audit: async (event: any) => void events.push(event) },
    }
  }

  test('an accepted decision is recorded against the user who made it', async () => {
    const ws = new InMemoryWorkflowService()
    const { events, sink } = collectingAudit()
    const cleanup = registerApprovalWorkflow(
      'auditedGate',
      'audited-gate',
      { approvers: 'not-initiator' },
      sink
    )

    const runId = await ws.createRun('auditedGate', {}, false, 'audited-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)
    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'reviewer',
      scopes: ['payments:approve'],
    })
    await ws.runWorkflowJob(runId, {})

    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'workflow.approval.decided')
    assert.equal(events[0].outcome, 'success')
    assert.equal(events[0].wireType, 'workflow')
    assert.equal(events[0].userIdentity.pikkuUserId, 'reviewer')
    assert.equal(events[0].metadata.runId, runId)
    assert.equal(events[0].metadata.reason, 'Release funds')
    assert.deepEqual(events[0].metadata.scopes, ['payments:approve'])
    assert.ok(!Number.isNaN(Date.parse(events[0].occurredAt)))

    cleanup()
  })

  test('a refused attempt is recorded too — that is the one worth keeping', async () => {
    const ws = new InMemoryWorkflowService()
    const { events, sink } = collectingAudit()
    const cleanup = registerApprovalWorkflow(
      'refusedGate',
      'refused-gate',
      { approvers: 'not-initiator' },
      sink
    )

    const runId = await ws.createRun('refusedGate', {}, false, 'refused-gate', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)

    await assert.rejects(
      ws.approveStep(runId, 'Release funds', { ok: true }, {
        userId: 'initiator',
      }),
      WorkflowApprovalForbiddenError
    )

    assert.equal(events.length, 1)
    assert.equal(events[0].outcome, 'denied')
    assert.equal(events[0].userIdentity.pikkuUserId, 'initiator')
    assert.match(events[0].metadata.refusal, /may not answer/)

    cleanup()
  })

  test('a decision refused on replay is recorded, having been refused nowhere else', async () => {
    const ws = new InMemoryWorkflowService()
    const { events, sink } = collectingAudit()
    const cleanup = registerApprovalWorkflow(
      'replayRefused',
      'replay-refused',
      { approvers: 'not-initiator' },
      sink
    )

    const runId = await ws.createRun(
      'replayRefused',
      {},
      false,
      'replay-refused',
      { type: 'http', pikkuUserId: 'initiator' }
    )

    // Submitted before the gate published its policy, so it is accepted here
    // and only refused on replay.
    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'initiator',
    })
    assert.equal(events[0].outcome, 'success')

    await runToGate(ws, runId)

    assert.equal(events.length, 2)
    assert.equal(events[1].outcome, 'denied')
    assert.equal(events[1].userIdentity.pikkuUserId, 'initiator')
    assert.match(events[1].metadata.refusal, /may not answer/)

    cleanup()
  })

  test('a failing sink does not cost the decision', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow(
      'brokenSink',
      'broken-sink',
      {},
      {
        audit: async () => {
          throw new Error('sink is down')
        },
      }
    )

    const runId = await ws.createRun('brokenSink', {}, false, 'broken-sink', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)
    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'reviewer',
    })
    await ws.runWorkflowJob(runId, {})

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    cleanup()
  })

  test('a project with no audit sink wired is unaffected', async () => {
    const ws = new InMemoryWorkflowService()
    const cleanup = registerApprovalWorkflow('noSink', 'no-sink', {})

    const runId = await ws.createRun('noSink', {}, false, 'no-sink', {
      type: 'http',
      pikkuUserId: 'initiator',
    })
    await runToGate(ws, runId)
    await ws.approveStep(runId, 'Release funds', { ok: true }, {
      userId: 'reviewer',
    })
    await ws.runWorkflowJob(runId, {})

    assert.equal((await ws.getRun(runId))?.status, 'completed')
    cleanup()
  })
})