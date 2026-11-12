import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { GoneError } from '../../errors/errors.js'
import { InMemoryAgentRunStateService } from '../../services/in-memory-agent-run-state-service.js'
import type { CreateRunInput } from '../../services/agent-run-state-service.js'
import { resumeAgentSync } from './agent-runner.js'
import { resumeAgent } from './agent-stream.js'
import { addAgent, approveAgent } from './agent-registry.js'
import {
  APPROVAL_EXPIRED_MESSAGE,
  DEFAULT_AGENT_APPROVAL_TTL_MS,
  approvalExpiresAt,
} from './agent-approval-expiry.js'
import type {
  AgentStreamEvent,
  CoreAgent,
  PendingApproval,
} from './agent.types.js'

const OWNER = 'resource-expiry'
const asOwner = { sessionService: { get: () => ({ userId: OWNER }) } as never }
const PAST = () => new Date(Date.now() - 1000)
const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000)

const registerAgent = (agentName: string) => {
  const agent: CoreAgent = {
    auth: false,
    name: agentName,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'test/test-model',
    tools: [],
  } as CoreAgent
  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    tools: ['refund'],
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  } as any
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
}

const suspendedRun = (
  agentName: string,
  pendingApprovals: PendingApproval[]
): CreateRunInput => ({
  agentName,
  threadId: 'thread-expiry',
  resourceId: OWNER,
  status: 'suspended',
  suspendReason: 'approval',
  pendingApprovals,
  usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
  createdAt: new Date(),
  updatedAt: new Date(),
})

const refund = (expiresAt: Date | undefined): PendingApproval => ({
  type: 'tool-call',
  toolCallId: 'tc-refund',
  toolName: 'refund',
  args: {},
  expiresAt,
})

const channel = (events: AgentStreamEvent[]) =>
  ({
    channelId: 'channel-expiry',
    openingData: undefined,
    state: 'open',
    send: (event: AgentStreamEvent) => {
      events.push(event)
    },
    close: () => {},
  }) as any

let store: InMemoryAgentRunStateService
let claims: string[]
let executions: number
let modelCalls: number

beforeEach(() => {
  resetPikkuState()
  store = new InMemoryAgentRunStateService()
  claims = []
  executions = 0
  modelCalls = 0
  const resolveApproval = store.resolveApproval.bind(store)
  store.resolveApproval = async (claim) => {
    claims.push(claim.toolCallId)
    return resolveApproval(claim)
  }

  pikkuState(null, 'rpc', 'meta').refund = 'refund'
  pikkuState(null, 'function', 'meta').refund = {
    description: 'Refund',
    sessionless: true,
  } as any
  pikkuState(null, 'function', 'functions').set('refund', {
    func: async () => {
      executions++
      return { refunded: true }
    },
  } as any)

  pikkuState(null, 'package', 'singletonServices', {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    agentRunState: store,
    agentRunner: {
      run: async () => {
        modelCalls++
        return {
          text: 'done',
          toolCalls: [],
          toolResults: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'stop',
        }
      },
    },
  } as any)
})

const assertExpired = async (runId: string) => {
  const run = await store.getRun(runId)
  assert.equal(run?.status, 'failed')
  assert.equal(run?.errorMessage, APPROVAL_EXPIRED_MESSAGE)
  assert.deepEqual(run?.pendingApprovals, [])
}

const assertNothingRan = () => {
  assert.deepEqual(claims, [], 'nothing was claimed')
  assert.equal(executions, 0, 'the tool did not run')
  assert.equal(modelCalls, 0, 'the model was not called')
}

describe('an expired approval', () => {
  test('resumeAgentSync refuses it with a GoneError naming the run, the tool call and the expiry, and fails the run', async () => {
    registerAgent('expiry-agent')
    const expiresAt = PAST()
    const runId = await store.createRun(
      suspendedRun('expiry-agent', [refund(expiresAt)])
    )

    await assert.rejects(
      () =>
        resumeAgentSync(
          runId,
          [{ toolCallId: 'tc-refund', approved: true }],
          asOwner
        ),
      (err: unknown) =>
        err instanceof GoneError &&
        err.message.includes(runId) &&
        err.message.includes('tc-refund') &&
        err.message.includes(expiresAt.toISOString())
    )
    await assertExpired(runId)
    assertNothingRan()
  })

  test('resumeAgentSync refuses an approval saved with no expiry', async () => {
    registerAgent('expiry-agent')
    const runId = await store.createRun(
      suspendedRun('expiry-agent', [refund(undefined)])
    )

    await assert.rejects(
      () =>
        resumeAgentSync(
          runId,
          [{ toolCallId: 'tc-refund', approved: true }],
          asOwner
        ),
      (err: unknown) =>
        err instanceof GoneError && /no expiry recorded/.test(err.message)
    )
    await assertExpired(runId)
    assertNothingRan()
  })

  test('resumeAgentSync still runs an approval inside its expiry', async () => {
    registerAgent('expiry-agent')
    const runId = await store.createRun(
      suspendedRun('expiry-agent', [refund(FUTURE())])
    )

    await resumeAgentSync(
      runId,
      [{ toolCallId: 'tc-refund', approved: true }],
      asOwner
    )
    assert.deepEqual(claims, ['tc-refund'])
    assert.equal(executions, 1)
  })

  test('streaming resumeAgent refuses it and fails the run', async () => {
    registerAgent('expiry-agent')
    const runId = await store.createRun(
      suspendedRun('expiry-agent', [refund(PAST())])
    )

    const events: AgentStreamEvent[] = []
    await assert.rejects(
      () =>
        resumeAgent(
          { runId, toolCallId: 'tc-refund', approved: true },
          channel(events),
          asOwner
        ),
      GoneError
    )
    await assertExpired(runId)
    assertNothingRan()
    assert.deepEqual(events, [], 'nothing was streamed')
  })

  test("a sub-agent's expired approval fails the parent run too", async () => {
    registerAgent('parent-agent')
    registerAgent('child-agent')
    const childRunId = await store.createRun(
      suspendedRun('child-agent', [refund(PAST())])
    )
    const parentRunId = await store.createRun(
      suspendedRun('parent-agent', [
        {
          type: 'agent-call',
          toolCallId: 'tc-delegate',
          agentName: 'child-agent',
          agentRunId: childRunId,
          displayToolName: 'refund',
          displayArgs: {},
          expiresAt: FUTURE(),
        },
      ])
    )

    await assert.rejects(
      () =>
        resumeAgent(
          { runId: parentRunId, toolCallId: 'tc-delegate', approved: true },
          channel([]),
          asOwner
        ),
      GoneError
    )
    await assertExpired(childRunId)
    await assertExpired(parentRunId)
    assert.equal(executions, 0, 'the tool did not run')
  })

  test('approveAgent refuses it and fails the run', async () => {
    registerAgent('expiry-agent')
    const runId = await store.createRun(
      suspendedRun('expiry-agent', [refund(PAST())])
    )

    await assert.rejects(
      () =>
        approveAgent(
          store,
          runId,
          [{ toolCallId: 'tc-refund', approved: true }],
          asOwner
        ),
      GoneError
    )
    await assertExpired(runId)
  })
})

describe('approvalTtlMs', () => {
  test('defaults to ten minutes and follows the agent when set', () => {
    const now = Date.now()
    assert.equal(DEFAULT_AGENT_APPROVAL_TTL_MS, 10 * 60 * 1000)
    assert.equal(
      approvalExpiresAt({}, now).getTime(),
      now + DEFAULT_AGENT_APPROVAL_TTL_MS
    )
    assert.equal(
      approvalExpiresAt({ approvalTtlMs: 1500 }, now).getTime(),
      now + 1500
    )
  })

  for (const approvalTtlMs of [Infinity, 0, -1, NaN]) {
    test(`addAgent refuses approvalTtlMs ${approvalTtlMs}, so the expiry cannot be switched off`, () => {
      pikkuState(null, 'agent', 'agentsMeta')['ttl-agent'] = {} as any
      assert.throws(
        () =>
          addAgent('ttl-agent', {
            name: 'ttl-agent',
            model: 'test/test-model',
            approvalTtlMs,
          } as CoreAgent),
        /approvalTtlMs .* must be a finite number of milliseconds above zero/
      )
      assert.equal(pikkuState(null, 'agent', 'agents').has('ttl-agent'), false)
    })
  }

  test('addAgent accepts a positive approvalTtlMs', () => {
    pikkuState(null, 'agent', 'agentsMeta')['ttl-agent'] = {} as any
    addAgent('ttl-agent', {
      name: 'ttl-agent',
      model: 'test/test-model',
      approvalTtlMs: 30_000,
    } as CoreAgent)
    assert.equal(pikkuState(null, 'agent', 'agents').has('ttl-agent'), true)
  })
})
