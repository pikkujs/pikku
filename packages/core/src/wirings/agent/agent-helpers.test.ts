import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import {
  agent,
  agentStream,
  agentResume,
  agentApprove,
} from './agent-helpers.js'
import { agentCallOptions } from './agent-prepare.js'
import { createAgentRPC } from './agent-rpc.js'
import type { CoreAgent } from './agent.types.js'
import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { InMemoryAgentRunStateService } from '../../services/in-memory-agent-run-state-service.js'
import { ForbiddenError } from '../../errors/errors.js'
import { wireAddon } from '../addon/wire-addon.js'

describe('agent helpers', () => {
  describe('agent', () => {
    test('should return an object with func', () => {
      const a = agent('myAgent')
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.run', async () => {
      const a = agent('myAgent')
      let calledWith: any
      const rpc = {
        agent: {
          run: async (...args: any[]) => {
            calledWith = args
            return {
              runId: 'run-1',
              result: 'done',
              usage: { inputTokens: 10, outputTokens: 20 },
            }
          },
        },
      }
      const input = { message: 'hello', threadId: 't1', resourceId: 'r1' }
      const result = await a.func({}, input, { rpc })
      assert.strictEqual(calledWith[0], 'myAgent')
      assert.deepStrictEqual(calledWith[1], input)
      assert.strictEqual(result.runId, 'run-1')
    })
  })

  describe('agentStream', () => {
    test('should return an object with func', () => {
      const a = agentStream('myAgent')
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.stream with bound name', async () => {
      const a = agentStream('myAgent')
      let calledWith: any
      const rpc = {
        agent: {
          stream: async (...args: any[]) => {
            calledWith = args
          },
        },
      }
      const input = { message: 'hello', threadId: 't1', resourceId: 'r1' }
      await a.func({}, input, { rpc })
      assert.strictEqual(calledWith[0], 'myAgent')
      assert.deepStrictEqual(calledWith[1], input)
    })

    test('func should extract agentName from data when no name bound', async () => {
      const a = agentStream()
      let calledWith: any
      const rpc = {
        agent: {
          stream: async (...args: any[]) => {
            calledWith = args
          },
        },
      }
      const input = {
        agentName: 'dynamicAgent',
        message: 'hello',
        threadId: 't1',
        resourceId: 'r1',
      }
      await a.func({}, input, { rpc })
      assert.strictEqual(calledWith[0], 'dynamicAgent')
      assert.deepStrictEqual(calledWith[1], {
        message: 'hello',
        threadId: 't1',
        resourceId: 'r1',
      })
    })

    test('func should throw when no name bound and no agentName in data', async () => {
      const a = agentStream()
      const rpc = { agent: { stream: async () => {} } }
      await assert.rejects(() => a.func({}, { message: 'hello' }, { rpc }), {
        message:
          'agentStream requires an agentName either as a parameter or in the input data',
      })
    })
  })

  describe('agentResume', () => {
    test('should return an object with func', () => {
      const a = agentResume()
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.resume', async () => {
      const a = agentResume()
      let calledWith: any
      const rpc = {
        agent: {
          resume: async (...args: any[]) => {
            calledWith = args
          },
        },
      }
      const data = { runId: 'run-1', toolCallId: 'tc1', approved: true }
      await a.func({}, data, { rpc })
      assert.strictEqual(calledWith[0], 'run-1')
      assert.deepStrictEqual(calledWith[1], {
        toolCallId: 'tc1',
        approved: true,
      })
    })
  })

  describe('agentApprove', () => {
    test('should return an object with func', () => {
      const a = agentApprove('myAgent')
      assert.strictEqual(typeof a.func, 'function')
    })

    test('func should call rpc.agent.approve', async () => {
      const a = agentApprove('myAgent')
      let calledWith: any
      const rpc = {
        agent: {
          approve: async (...args: any[]) => {
            calledWith = args
            return { approved: true }
          },
        },
      }
      const data = {
        runId: 'run-1',
        approvals: [{ toolCallId: 'tc1', approved: true }],
      }
      const result = await a.func({}, data, { rpc })
      assert.strictEqual(calledWith[0], 'run-1')
      assert.deepStrictEqual(calledWith[1], [
        { toolCallId: 'tc1', approved: true },
      ])
      assert.strictEqual(calledWith[2], 'myAgent')
      assert.deepStrictEqual(result, { approved: true })
    })
  })
})

describe('agentApprove is scoped to the agent its route was built for', () => {
  const owner = 'user-1'
  let agentRunState: InMemoryAgentRunStateService
  let deployed: number

  const registerAgent = (name: string) => {
    const agent: CoreAgent = {
      name,
      description: 'test agent',
      instructions: 'be helpful',
      model: 'test/test-model',
    }
    pikkuState(null, 'agent', 'agentsMeta')[name] = {
      ...agent,
      tools: ['deploy'],
      inputSchema: null,
      outputSchema: null,
      workingMemorySchema: null,
    } as any
    pikkuState(null, 'agent', 'agents').set(name, agent)
  }

  const suspendedRun = (agentName: string) =>
    agentRunState.createRun({
      agentName,
      threadId: `thread-${agentName}`,
      resourceId: owner,
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          type: 'tool-call',
          toolCallId: `tc-${agentName}`,
          toolName: 'deploy',
          args: { env: 'prod' },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

  const approveThroughRoute = (
    routeAgent: string,
    runId: string,
    toolCallId: string
  ) => {
    const rpc = {
      agent: createAgentRPC({} as any, {
        sessionService: { get: () => ({ userId: owner }) } as any,
      }),
    }
    return agentApprove(routeAgent).func(
      {},
      { runId, approvals: [{ toolCallId, approved: true }] },
      { rpc }
    )
  }

  beforeEach(() => {
    resetPikkuState()
    registerAgent('agentA')
    registerAgent('agentB')
    pikkuState(null, 'rpc', 'meta').deploy = 'deploy'
    pikkuState(null, 'function', 'meta').deploy = {
      description: 'Deploy',
      inputSchemaName: 'DeployInput',
      sessionless: true,
    } as any
    pikkuState(null, 'misc', 'schemas').set('DeployInput', {
      type: 'object',
      properties: { env: { type: 'string' } },
    })
    deployed = 0
    pikkuState(null, 'function', 'functions').set('deploy', {
      func: async () => {
        deployed++
        return { deployed: true }
      },
    } as any)

    agentRunState = new InMemoryAgentRunStateService()
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      agentRunState,
      agentRunner: {
        run: async () => ({
          text: 'done',
          toolCalls: [],
          toolResults: [],
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop',
        }),
      },
      agentStorage: {
        saveMessages: async () => {},
        getMessages: async () => [],
      },
    } as any)
  })

  test("refuses agent B's run approved through agent A's route", async () => {
    const runId = await suspendedRun('agentB')

    await assert.rejects(
      () => approveThroughRoute('agentA', runId, 'tc-agentB'),
      (error: unknown) => {
        assert.ok(error instanceof ForbiddenError)
        assert.strictEqual(
          (error as Error).message,
          `Run ${runId} belongs to agent 'agentB', not 'agentA'`
        )
        return true
      }
    )
    assert.strictEqual(deployed, 0, 'the tool never ran')
    const run = await agentRunState.getRun(runId)
    assert.strictEqual(run?.status, 'suspended')
    assert.strictEqual(run?.pendingApprovals?.length, 1, 'nothing was claimed')
  })

  test("approves agent A's own run through agent A's route", async () => {
    const runId = await suspendedRun('agentA')

    const result = await approveThroughRoute('agentA', runId, 'tc-agentA')

    assert.strictEqual(result.runId, runId)
    assert.strictEqual(result.result, 'done')
    assert.strictEqual(deployed, 1)
    assert.strictEqual((await agentRunState.getRun(runId))?.status, 'completed')
  })

  test('an addon approves its run through the alias the app mapped', async () => {
    registerAgent('payments:support')
    wireAddon({
      name: 'billing',
      package: '@acme/addon-billing',
      uses: { stripe: 'payments' },
    })
    const runId = await suspendedRun('payments:support')
    const agent = createAgentRPC({ addonNamespace: 'billing' } as any, {
      sessionService: { get: () => ({ userId: owner }) } as any,
    })

    const result = await agent.approve(
      runId,
      [{ toolCallId: 'tc-payments:support', approved: true }],
      'stripe:support'
    )

    assert.strictEqual(result.runId, runId)
    assert.strictEqual(deployed, 1)
  })
})

describe('agentCallOptions', () => {
  // An explicit `undefined` overrides the agent's own declared default with
  // nothing, so a request that names no model would silently unset the one the
  // agent declares.
  test('a field nobody supplied is left out rather than sent as undefined', () => {
    const options = agentCallOptions({
      message: 'hello',
      threadId: 't1',
      resourceId: 'r1',
    })
    assert.equal('model' in options, false)
    assert.equal('temperature' in options, false)
    assert.equal('context' in options, false)
    assert.equal('attachments' in options, false)
  })

  test('what was supplied is carried through unchanged', () => {
    const options = agentCallOptions({
      message: 'hello',
      threadId: 't1',
      resourceId: 'user-1',
      model: 'a-model',
      temperature: 0.2,
      context: 'some context',
      attachments: [{ type: 'image' as const, url: 'a.png' }],
    })
    assert.deepEqual(options, {
      message: 'hello',
      threadId: 't1',
      resourceId: 'user-1',
      attachments: [{ type: 'image' as const, url: 'a.png' }],
      model: 'a-model',
      temperature: 0.2,
      context: 'some context',
    })
  })

  // Zero is a temperature a caller can mean, and the falsy check every other
  // field uses would drop it.
  test('a temperature of zero survives, unlike an empty string', () => {
    assert.equal(
      agentCallOptions({
        message: 'x',
        threadId: 't',
        resourceId: 'r',
        temperature: 0,
      }).temperature,
      0
    )
    assert.equal(
      'context' in
        agentCallOptions({
          message: 'x',
          threadId: 't',
          resourceId: 'r',
          context: '',
        }),
      false
    )
  })
})
