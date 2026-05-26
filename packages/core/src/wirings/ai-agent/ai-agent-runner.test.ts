import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { runAIAgent, resumeAIAgentSync } from './ai-agent-runner.js'
import type {
  AgentRunState,
  CoreAIAgent,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'
import { AIProviderNotConfiguredError } from '../../errors/errors.js'

beforeEach(() => {
  resetPikkuState()
})

const addTestAgent = (agentName: string) => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'test-model',
  }

  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  }
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
  pikkuState(null, 'models', 'config', {
    models: { 'test-model': 'test/test-model' },
  })
}

const makeStepResult = (
  overrides?: Partial<AIAgentStepResult>
): AIAgentStepResult => ({
  text: '',
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  finishReason: 'stop',
  ...overrides,
})

describe('runAIAgent', () => {
  test('throws when aiRunState service is missing', async () => {
    addTestAgent('missing-run-state-agent')

    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async () => makeStepResult({ text: 'unused' }),
      },
    } as any)

    await assert.rejects(
      () =>
        runAIAgent(
          'missing-run-state-agent',
          { message: 'hello', threadId: 't', resourceId: 'r' },
          {}
        ),
      {
        message: 'AIRunStateService not available in singletonServices',
      }
    )
  })

  test('throws AIProviderNotConfiguredError when aiAgentRunner is missing', async () => {
    addTestAgent('no-provider-agent')

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiRunState: {
        createRun: async () => 'run-no-provider',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await assert.rejects(
      () =>
        runAIAgent(
          'no-provider-agent',
          { message: 'hello', threadId: 't', resourceId: 'r' },
          {}
        ),
      (error: unknown) => {
        assert.ok(error instanceof AIProviderNotConfiguredError)
        assert.match((error as Error).message, /AI provider/)
        return true
      }
    )
  })

  test('marks run as failed when runner throws', async () => {
    addTestAgent('failing-agent')

    const updates: unknown[] = []
    const expectedError = new Error('runner failed')

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async () => {
          throw expectedError
        },
      },
      aiRunState: {
        createRun: async () => 'run-1',
        updateRun: async (_runId: string, patch: unknown) => {
          updates.push(patch)
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await assert.rejects(
      () =>
        runAIAgent(
          'failing-agent',
          {
            message: 'hello',
            threadId: 'thread-1',
            resourceId: 'resource-1',
          },
          {}
        ),
      expectedError
    )

    assert.deepEqual(updates, [
      { status: 'failed', errorMessage: 'runner failed' },
    ])
  })

  test('loops through multiple steps and accumulates usage', async () => {
    addTestAgent('multi-step-agent')

    let callCount = 0
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> => {
          callCount++
          if (callCount === 1) {
            return makeStepResult({
              text: '',
              toolCalls: [
                { toolCallId: 'tc-1', toolName: 'myTool', args: { q: 'test' } },
              ],
              toolResults: [
                {
                  toolCallId: 'tc-1',
                  toolName: 'myTool',
                  result: 'tool output',
                },
              ],
              usage: { inputTokens: 100, outputTokens: 50 },
              finishReason: 'tool-calls',
            })
          }
          return makeStepResult({
            text: 'Final answer',
            usage: { inputTokens: 80, outputTokens: 30 },
            finishReason: 'stop',
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-multi',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await runAIAgent(
      'multi-step-agent',
      {
        message: 'hello',
        threadId: 'thread-multi',
        resourceId: 'resource-multi',
      },
      {}
    )

    assert.equal(callCount, 2)
    assert.equal(result.text, 'Final answer')
    assert.equal(result.usage.inputTokens, 180)
    assert.equal(result.usage.outputTokens, 80)
    assert.equal(result.steps.length, 2)
  })

  test('afterStep hook is called for each step', async () => {
    addTestAgent('afterstep-agent')

    const afterStepCalls: unknown[] = []
    const middleware: PikkuAIMiddlewareHooks = {
      afterStep: async (_services, ctx) => {
        afterStepCalls.push(ctx)
      },
    }
    const agent = pikkuState(null, 'agent', 'agents').get('afterstep-agent')!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('afterstep-agent', agent)

    let callCount = 0
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> => {
          callCount++
          if (callCount === 1) {
            return makeStepResult({
              text: 'thinking...',
              toolCalls: [
                { toolCallId: 'tc-1', toolName: 'myTool', args: { q: 'test' } },
              ],
              toolResults: [
                { toolCallId: 'tc-1', toolName: 'myTool', result: 'output' },
              ],
              usage: { inputTokens: 100, outputTokens: 50 },
              finishReason: 'tool-calls',
            })
          }
          return makeStepResult({
            text: 'done',
            usage: { inputTokens: 80, outputTokens: 30 },
            finishReason: 'stop',
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-afterstep',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await runAIAgent(
      'afterstep-agent',
      { message: 'hi', threadId: 't1', resourceId: 'r1' },
      {}
    )

    assert.equal(afterStepCalls.length, 2)
    const first = afterStepCalls[0] as any
    assert.equal(first.stepNumber, 0)
    assert.equal(first.finishReason, 'tool-calls')
    assert.equal(first.toolCalls.length, 1)
    const second = afterStepCalls[1] as any
    assert.equal(second.stepNumber, 1)
    assert.equal(second.finishReason, 'stop')
    assert.equal(second.text, 'done')
  })

  test('onError hook is called when runner throws', async () => {
    addTestAgent('onerror-agent')

    const onErrorCalls: unknown[] = []
    const middleware: PikkuAIMiddlewareHooks = {
      onError: async (_services, ctx) => {
        onErrorCalls.push(ctx)
      },
    }
    const agent = pikkuState(null, 'agent', 'agents').get('onerror-agent')!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('onerror-agent', agent)

    const expectedError = new Error('boom')
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async () => {
          throw expectedError
        },
      },
      aiRunState: {
        createRun: async () => 'run-err',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await assert.rejects(
      () =>
        runAIAgent(
          'onerror-agent',
          { message: 'hi', threadId: 't2', resourceId: 'r2' },
          {}
        ),
      expectedError
    )

    assert.equal(onErrorCalls.length, 1)
    const call = onErrorCalls[0] as any
    assert.equal(call.error.message, 'boom')
    assert.equal(call.stepNumber, -1)
  })

  test('onError hook failure does not suppress original error', async () => {
    addTestAgent('onerror-throws-agent')

    const middleware: PikkuAIMiddlewareHooks = {
      onError: async () => {
        throw new Error('hook error')
      },
    }
    const agent = pikkuState(null, 'agent', 'agents').get(
      'onerror-throws-agent'
    )!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('onerror-throws-agent', agent)

    const expectedError = new Error('original error')
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async () => {
          throw expectedError
        },
      },
      aiRunState: {
        createRun: async () => 'run-safe',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await assert.rejects(
      () =>
        runAIAgent(
          'onerror-throws-agent',
          { message: 'hi', threadId: 't3', resourceId: 'r3' },
          {}
        ),
      expectedError
    )
  })

  test('returns suspended run when required RPC tool is missing', async () => {
    addTestAgent('missing-rpc-agent')
    pikkuState(null, 'agent', 'agentsMeta')['missing-rpc-agent'].tools = [
      'deployMissing',
    ]

    const createdRuns: any[] = []
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async () => {
          throw new Error('should not run')
        },
      },
      aiRunState: {
        createRun: async (run: any) => {
          createdRuns.push(run)
          return 'run-missing-rpc'
        },
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await runAIAgent(
      'missing-rpc-agent',
      { message: 'deploy', threadId: 'thread-1', resourceId: 'resource-1' },
      {}
    )

    assert.equal(result.runId, 'run-missing-rpc')
    assert.equal(result.text, '')
    assert.deepEqual(result.steps, [])
    assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0 })
    assert.deepEqual(createdRuns, [
      {
        agentName: 'missing-rpc-agent',
        threadId: 'thread-1',
        resourceId: 'resource-1',
        status: 'suspended',
        suspendReason: 'rpc-missing',
        missingRpcs: ['deployMissing'],
        usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
        createdAt: createdRuns[0].createdAt,
        updatedAt: createdRuns[0].updatedAt,
      },
    ])
  })

  test('modifyInput and modifyOutput middleware transform the run payload', async () => {
    addTestAgent('middleware-agent')

    const seenRunnerParams: any[] = []
    const inputMessages = [
      { id: 'extra', role: 'system', content: 'extra', createdAt: new Date() },
    ] as any
    const middleware: PikkuAIMiddlewareHooks = {
      modifyInput: async (_services, ctx) => ({
        instructions: `${ctx.instructions}\n\nextra rules`,
        messages: [...ctx.messages, ...inputMessages],
      }),
      modifyOutput: async (_services, ctx) => ({
        text: `${ctx.text} [postprocessed]`,
        messages: [...ctx.messages],
      }),
    }
    const agent = pikkuState(null, 'agent', 'agents').get('middleware-agent')!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('middleware-agent', agent)

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (params: any): Promise<AIAgentStepResult> => {
          seenRunnerParams.push({
            instructions: params.instructions,
            messages: params.messages,
          })
          return makeStepResult({
            text: 'Final answer',
            object: { ok: true },
            usage: { inputTokens: 11, outputTokens: 7 },
          } as any)
        },
      },
      aiRunState: {
        createRun: async () => 'run-middleware',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await runAIAgent(
      'middleware-agent',
      { message: 'hello', threadId: 'thread-mw', resourceId: 'resource-mw' },
      {}
    )

    assert.equal(seenRunnerParams.length, 1)
    assert.match(seenRunnerParams[0].instructions, /extra rules/)
    assert.equal(seenRunnerParams[0].messages.at(-1).content, 'extra')
    assert.equal(result.text, 'Final answer [postprocessed]')
    assert.deepEqual(result.object, { ok: true })
  })

  test('prepareStep can stop execution before calling the runner', async () => {
    addTestAgent('prepare-stop-agent')

    const agent = pikkuState(null, 'agent', 'agents').get('prepare-stop-agent')!
    agent.prepareStep = ({ stop }) => {
      stop()
    }
    pikkuState(null, 'agent', 'agents').set('prepare-stop-agent', agent)

    let runnerCalls = 0
    const updates: any[] = []
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> => {
          runnerCalls++
          return makeStepResult({ text: 'should not happen' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-stop',
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await runAIAgent(
      'prepare-stop-agent',
      {
        message: 'hello',
        threadId: 'thread-stop',
        resourceId: 'resource-stop',
      },
      {}
    )

    assert.equal(runnerCalls, 0)
    assert.equal(result.text, '')
    assert.deepEqual(result.steps, [])
    assert.deepEqual(updates, [
      {
        status: 'completed',
        usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
      },
    ])
  })

  test('suspends with approval details when a tool call requires approval', async () => {
    addTestAgent('approval-agent')
    pikkuState(null, 'agent', 'agentsMeta')['approval-agent'].tools = ['deploy']
    pikkuState(null, 'rpc', 'meta').deploy = 'deploy'
    pikkuState(null, 'function', 'meta').deploy = {
      description: 'Deploy',
      approvalRequired: true,
      inputSchemaName: 'DeployInput',
    }
    pikkuState(null, 'misc', 'schemas').set('DeployInput', {
      type: 'object',
      properties: { env: { type: 'string' } },
    })
    pikkuState(null, 'function', 'functions').set('deploy', {
      approvalDescription: async () => {
        throw new Error('description failed')
      },
    })

    const updates: any[] = []
    const savedMessages: any[] = []
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> =>
          makeStepResult({
            text: 'Need approval',
            toolCalls: [
              {
                toolCallId: 'tc-approve',
                toolName: 'deploy',
                args: { env: 'prod' },
              },
            ],
            usage: { inputTokens: 4, outputTokens: 2 },
            finishReason: 'tool-calls',
          }),
      },
      aiRunState: {
        createRun: async () => 'run-approval',
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
      },
      aiStorage: {
        createThread: async () => {},
        getMessages: async () => [],
        saveMessages: async (_threadId: string, messages: any[]) => {
          savedMessages.push(messages)
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await runAIAgent(
      'approval-agent',
      { message: 'deploy', threadId: 'thread-a', resourceId: 'resource-a' },
      {}
    )

    assert.equal(result.status, 'suspended')
    assert.equal(result.text, 'Need approval')
    assert.deepEqual(result.pendingApprovals, [
      {
        toolCallId: 'tc-approve',
        toolName: 'deploy',
        args: { env: 'prod' },
        reason: undefined,
        runId: 'run-approval',
      },
    ])
    assert.deepEqual(updates, [
      {
        status: 'suspended',
        suspendReason: 'approval',
        pendingApprovals: [
          {
            type: 'tool-call',
            toolCallId: 'tc-approve',
            toolName: 'deploy',
            args: { env: 'prod' },
          },
        ],
        usage: { inputTokens: 4, outputTokens: 2, model: 'test-model' },
      },
    ])
    assert.equal(savedMessages.length, 2)
    assert.equal(savedMessages[0][0].role, 'user')
    assert.equal(savedMessages[0][1].role, 'assistant')
    assert.equal(savedMessages[1][0].role, 'assistant')
  })
})

describe('resumeAIAgentSync', () => {
  test('throws for missing services, missing runs, wrong status, and missing runner', async () => {
    pikkuState(null, 'package', 'singletonServices', {} as any)
    await assert.rejects(() => resumeAIAgentSync('run-x', [], {}), {
      message: 'AIRunStateService not available in singletonServices',
    })

    pikkuState(null, 'package', 'singletonServices', {
      aiRunState: {
        getRun: async () => null,
      },
    } as any)
    await assert.rejects(() => resumeAIAgentSync('run-x', [], {}), {
      message: 'No run found for runId run-x',
    })

    addTestAgent('resume-guard-agent')
    pikkuState(null, 'package', 'singletonServices', {
      aiRunState: {
        getRun: async () => ({
          runId: 'run-y',
          agentName: 'resume-guard-agent',
          threadId: 't',
          resourceId: 'r',
          status: 'completed',
          usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    } as any)
    await assert.rejects(() => resumeAIAgentSync('run-y', [], {}), {
      message: 'Run run-y is not suspended (status: completed)',
    })

    pikkuState(null, 'package', 'singletonServices', {
      aiRunState: {
        getRun: async () => ({
          runId: 'run-z',
          agentName: 'resume-guard-agent',
          threadId: 't',
          resourceId: 'r',
          status: 'suspended',
          pendingApprovals: [],
          usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        resolveApproval: async () => {},
        updateRun: async () => {},
      },
    } as any)
    await assert.rejects(
      () => resumeAIAgentSync('run-z', [], {}),
      (error: unknown) => error instanceof AIProviderNotConfiguredError
    )
  })

  test('replays approved tool calls, strips nulls, and continues the run', async () => {
    addTestAgent('resume-agent')
    pikkuState(null, 'agent', 'agentsMeta')['resume-agent'].tools = ['deploy']
    pikkuState(null, 'rpc', 'meta').deploy = 'deploy'
    pikkuState(null, 'function', 'meta').deploy = {
      description: 'Deploy',
      inputSchemaName: 'DeployInput',
    }
    pikkuState(null, 'misc', 'schemas').set('DeployInput', {
      type: 'object',
      properties: { env: { type: 'string' }, optional: { type: 'string' } },
    })

    let executedInput: any
    pikkuState(null, 'function', 'functions').set('deploy', {
      func: async (_services: any, input: any) => {
        executedInput = input
        return { deployed: true }
      },
    })

    const savedMessages: any[] = []
    const updates: any[] = []
    const resolveCalls: any[] = []
    const run: AgentRunState = {
      runId: 'run-resume',
      agentName: 'resume-agent',
      threadId: 'thread-resume',
      resourceId: 'resource-resume',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          type: 'tool-call',
          toolCallId: 'tc-1',
          toolName: 'deploy',
          args: JSON.stringify({ env: 'prod', optional: null }),
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> =>
          makeStepResult({
            text: 'Resumed answer',
            usage: { inputTokens: 5, outputTokens: 3 },
          }),
      },
      aiRunState: {
        getRun: async () => run,
        createRun: async () => 'unused',
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
        resolveApproval: async (toolCallId: string, status: string) => {
          resolveCalls.push({ toolCallId, status })
        },
      },
      aiStorage: {
        saveMessages: async (threadId: string, messages: any[]) => {
          savedMessages.push({ threadId, messages })
        },
        getMessages: async () => [],
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await resumeAIAgentSync(
      'run-resume',
      [{ toolCallId: 'tc-1', approved: true }],
      {}
    )

    assert.deepEqual(resolveCalls, [{ toolCallId: 'tc-1', status: 'approved' }])
    assert.deepEqual(executedInput, { env: 'prod' })
    assert.equal(savedMessages.length, 2)
    assert.equal(savedMessages[0].messages[0].role, 'tool')
    assert.equal(result.text, 'Resumed answer')
    assert.deepEqual(updates, [
      { status: 'running' },
      {
        status: 'completed',
        usage: { inputTokens: 5, outputTokens: 3, model: 'test-model' },
      },
    ])
  })

  test('records denied approvals and rejects agent mismatches', async () => {
    addTestAgent('resume-agent')

    const baseRun: AgentRunState = {
      runId: 'run-deny',
      agentName: 'resume-agent',
      threadId: 'thread-deny',
      resourceId: 'resource-deny',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          type: 'tool-call',
          toolCallId: 'tc-2',
          toolName: 'deploy',
          args: { env: 'prod' },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const resolveCalls: any[] = []
    const savedMessages: any[] = []
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> =>
          makeStepResult({
            text: 'Declined',
            usage: { inputTokens: 1, outputTokens: 1 },
          }),
      },
      aiRunState: {
        getRun: async () => baseRun,
        createRun: async () => 'unused',
        updateRun: async () => {},
        resolveApproval: async (toolCallId: string, status: string) => {
          resolveCalls.push({ toolCallId, status })
        },
      },
      aiStorage: {
        saveMessages: async (_threadId: string, messages: any[]) => {
          savedMessages.push(messages)
        },
        getMessages: async () => [],
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const denied = await resumeAIAgentSync(
      'run-deny',
      [{ toolCallId: 'tc-2', approved: false }],
      {}
    )

    assert.deepEqual(resolveCalls, [{ toolCallId: 'tc-2', status: 'denied' }])
    assert.match(
      savedMessages[0][0].toolResults[0].result,
      /explicitly declined/
    )
    assert.equal(denied.text, 'Declined')

    await assert.rejects(
      () =>
        resumeAIAgentSync(
          'run-deny',
          [{ toolCallId: 'tc-2', approved: false }],
          {},
          'other-agent'
        ),
      {
        message:
          "Run run-deny belongs to agent 'resume-agent', not 'other-agent'",
      }
    )
  })

  test('captures tool execution errors during resume and persists them as tool results', async () => {
    addTestAgent('resume-error-agent')
    pikkuState(null, 'agent', 'agentsMeta')['resume-error-agent'].tools = [
      'deploy',
    ]
    pikkuState(null, 'rpc', 'meta').deploy = 'deploy'
    pikkuState(null, 'function', 'meta').deploy = {
      description: 'Deploy',
      inputSchemaName: 'DeployInput',
    }
    pikkuState(null, 'misc', 'schemas').set('DeployInput', {
      type: 'object',
      properties: { env: { type: 'string' } },
    })
    pikkuState(null, 'function', 'functions').set('deploy', {
      func: async () => {
        throw new Error('tool exploded')
      },
    })

    const savedMessages: any[] = []
    const run: AgentRunState = {
      runId: 'run-error',
      agentName: 'resume-error-agent',
      threadId: 'thread-error',
      resourceId: 'resource-error',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          type: 'tool-call',
          toolCallId: 'tc-error',
          toolName: 'deploy',
          args: { env: 'prod' },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> =>
          makeStepResult({
            text: 'Recovered',
            usage: { inputTokens: 1, outputTokens: 1 },
          }),
      },
      aiRunState: {
        getRun: async () => run,
        resolveApproval: async () => {},
        updateRun: async () => {},
      },
      aiStorage: {
        saveMessages: async (_threadId: string, messages: any[]) => {
          savedMessages.push(messages)
        },
        getMessages: async () => [],
      },
    } as any)

    const result = await resumeAIAgentSync(
      'run-error',
      [{ toolCallId: 'tc-error', approved: true }],
      {}
    )

    assert.match(savedMessages[0][0].toolResults[0].result, /tool exploded/)
    assert.equal(result.text, 'Recovered')
  })
})
