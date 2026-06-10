import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  appendStepMessages,
  checkForApprovals,
  checkForCredentialRequests,
  resumeAIAgent,
  streamAIAgent,
} from './ai-agent-stream.js'
import { ToolApprovalRequired } from './ai-agent-prepare.js'
import type {
  AgentRunState,
  CoreAIAgent,
  AIStreamEvent,
  AIMessage,
  PikkuAIMiddlewareHooks,
} from './ai-agent.types.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'

beforeEach(() => {
  resetPikkuState()
})

const addTestAgent = (agentName: string) => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: 'test agent',
    instructions: 'be helpful',
    model: 'test/test-model',
  }

  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  }
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
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

describe('streamAIAgent', () => {
  test('marks run as failed and emits error/done when stream runner throws', async () => {
    addTestAgent('failing-stream-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async () => {
          throw new Error('stream failed')
        },
      },
      aiRunState: {
        createRun: async () => 'run-1',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'failing-stream-agent',
      {
        message: 'hello',
        threadId: 'thread-1',
        resourceId: 'resource-1',
      },
      {
        channelId: 'channel-1',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.deepEqual(updates, [
      {
        runId: 'run-1',
        patch: { status: 'failed', errorMessage: 'stream failed' },
      },
    ])
    assert.deepEqual(
      events.map((event) => event.type),
      ['step-start', 'error', 'done']
    )
  })

  test('completes normally when stream returns no tool calls', async () => {
    addTestAgent('simple-stream-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          return makeStepResult({ text: 'Hello world' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-simple',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'simple-stream-agent',
      {
        message: 'hello',
        threadId: 'thread-simple',
        resourceId: 'resource-simple',
      },
      {
        channelId: 'channel-simple',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.deepEqual(updates, [
      { runId: 'run-simple', patch: { status: 'completed' } },
    ])
    assert.ok(events.some((e) => e.type === 'done'))
  })

  test('suspends run when tool needs approval (needsApproval flag)', async () => {
    addTestAgent('approval-stream-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          return makeStepResult({
            toolCalls: [
              {
                toolCallId: 'tool-call-1',
                toolName: 'tool-x',
                args: { id: 1 },
              },
            ],
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-2',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const agentName = 'approval-stream-agent'
    const agent = pikkuState(null, 'agent', 'agents').get(agentName)!
    agent.tools = ['tool-x']
    pikkuState(null, 'agent', 'agents').set(agentName, agent)
    pikkuState(null, 'agent', 'agentsMeta')[agentName].tools = ['tool-x']
    pikkuState(null, 'rpc', 'meta')['tool-x'] = 'tool-x'
    pikkuState(null, 'function', 'meta')['tool-x'] = {
      description: 'test tool',
      approvalRequired: true,
    }
    pikkuState(null, 'misc', 'schemas').set('ToolXInput', {
      type: 'object',
      properties: { id: { type: 'number' } },
    })

    await streamAIAgent(
      agentName,
      {
        message: 'hello',
        threadId: 'thread-2',
        resourceId: 'resource-2',
      },
      {
        channelId: 'channel-2',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {},
      undefined,
      { requiresToolApproval: 'all' }
    )

    assert.deepEqual(updates, [
      {
        runId: 'run-2',
        patch: {
          status: 'suspended',
          suspendReason: 'approval',
          pendingApprovals: [
            {
              type: 'tool-call',
              toolCallId: 'tool-call-1',
              toolName: 'tool-x',
              args: { id: 1 },
            },
          ],
        },
      },
    ])

    const approvalEvent = events.find(
      (e) => e.type === 'approval-request'
    ) as any
    assert.ok(approvalEvent)
    assert.equal(approvalEvent.toolCallId, 'tool-call-1')
    assert.equal(approvalEvent.toolName, 'tool-x')
    assert.deepEqual(approvalEvent.args, { id: 1 })

    assert.deepEqual(
      events
        .filter((e) => e.type === 'approval-request' || e.type === 'done')
        .map((e) => e.type),
      ['approval-request', 'done']
    )
  })

  test('suspends run when multiple tool calls need approval (explicit policy)', async () => {
    addTestAgent('multi-approval-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          // Simulate LLM returning 3 addTodo calls in one step
          return makeStepResult({
            toolCalls: [
              {
                toolCallId: 'tc-1',
                toolName: 'todos__addTodo',
                args: { title: 'todo 1' },
              },
              {
                toolCallId: 'tc-2',
                toolName: 'todos__addTodo',
                args: { title: 'todo 2' },
              },
              {
                toolCallId: 'tc-3',
                toolName: 'todos__addTodo',
                args: { title: 'todo 3' },
              },
            ],
            // No toolResults since tools have no execute (needsApproval)
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-multi-approval',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const agentName = 'multi-approval-agent'
    pikkuState(null, 'agent', 'agentsMeta')[agentName].tools = [
      'todos__addTodo',
    ]
    pikkuState(null, 'rpc', 'meta')['todos__addTodo'] = 'addTodo'
    pikkuState(null, 'function', 'meta')['addTodo'] = {
      description: 'Add a todo',
      approvalRequired: true,
      inputSchemaName: 'AddTodoInput',
      sessionless: true,
    }
    pikkuState(null, 'misc', 'schemas').set('AddTodoInput', {
      type: 'object',
      properties: { title: { type: 'string' } },
    })

    await streamAIAgent(
      agentName,
      {
        message: 'create 3 todos',
        threadId: 'thread-multi-approval',
        resourceId: 'resource-multi-approval',
      },
      {
        channelId: 'channel-multi-approval',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
      // No options → defaults to requiresToolApproval: 'explicit'
    )

    // Should suspend on first tool call
    const approvalEvent = events.find(
      (e) => e.type === 'approval-request'
    ) as any
    assert.ok(approvalEvent, 'Should have an approval-request event')
    assert.equal(approvalEvent.toolCallId, 'tc-1')
    assert.equal(approvalEvent.toolName, 'todos__addTodo')

    // Run should be suspended
    assert.ok(
      updates.some((u) => (u.patch as any).status === 'suspended'),
      'Run should be suspended for approval'
    )

    assert.ok(events.some((e) => e.type === 'done'))
  })

  test('suspends run for addon tools using namespaced resolution (explicit policy)', async () => {
    addTestAgent('addon-approval-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (params: any): Promise<AIAgentStepResult> => {
          // Verify the tool was built with needsApproval
          const addTodoTool = params.tools.find(
            (t: any) => t.name === 'todos__addTodo'
          )
          assert.ok(addTodoTool, 'Tool todos__addTodo should exist')
          assert.equal(
            addTodoTool.needsApproval,
            true,
            'Tool should have needsApproval=true'
          )

          // Simulate LLM calling the tool
          return makeStepResult({
            toolCalls: [
              {
                toolCallId: 'tc-1',
                toolName: 'todos__addTodo',
                args: { title: 'new todo' },
              },
            ],
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-addon-approval',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    // Register addon package
    pikkuState(null, 'addons', 'packages').set('todos', {
      package: '@test/addon-todos',
    })

    // Set up addon package's function metadata
    pikkuState('@test/addon-todos', 'function', 'meta')['addTodo'] = {
      description: 'Add a todo',
      approvalRequired: true,
      inputSchemaName: 'AddTodoInput',
      sessionless: true,
    }
    pikkuState('@test/addon-todos', 'misc', 'schemas').set('AddTodoInput', {
      type: 'object',
      properties: { title: { type: 'string' } },
    })

    // Set up agent with namespaced tool
    const agentName = 'addon-approval-agent'
    pikkuState(null, 'agent', 'agentsMeta')[agentName].tools = ['todos:addTodo']

    await streamAIAgent(
      agentName,
      {
        message: 'add a todo',
        threadId: 'thread-addon-approval',
        resourceId: 'resource-addon-approval',
      },
      {
        channelId: 'channel-addon-approval',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    // Should suspend on the tool call
    const approvalEvent = events.find(
      (e) => e.type === 'approval-request'
    ) as any
    assert.ok(approvalEvent, 'Should have an approval-request event')
    assert.equal(approvalEvent.toolCallId, 'tc-1')
    assert.equal(approvalEvent.toolName, 'todos__addTodo')

    // Run should be suspended
    assert.ok(
      updates.some((u) => (u.patch as any).status === 'suspended'),
      'Run should be suspended for approval'
    )
  })

  test('suspends with agent-call type when sub-agent returns approval sentinel', async () => {
    addTestAgent('parent-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          return makeStepResult({
            toolCalls: [
              {
                toolCallId: 'tool-call-2',
                toolName: 'sub-agent',
                args: { message: 'hi' },
              },
            ],
            toolResults: [
              {
                toolCallId: 'tool-call-2',
                toolName: 'sub-agent',
                result: {
                  __approvalRequired: true,
                  toolName: 'sub-agent',
                  args: { message: 'hi' },
                  displayToolName: 'deleteTodo',
                  displayArgs: { todoId: '2' },
                  agentRunId: 'sub-run-1',
                },
              },
            ],
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-3',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'parent-agent',
      {
        message: 'hello',
        threadId: 'thread-3',
        resourceId: 'resource-3',
      },
      {
        channelId: 'channel-3',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.deepEqual(updates, [
      {
        runId: 'run-3',
        patch: {
          status: 'suspended',
          suspendReason: 'approval',
          pendingApprovals: [
            {
              type: 'agent-call',
              toolCallId: 'tool-call-2',
              agentName: 'sub-agent',
              agentRunId: 'sub-run-1',
              displayToolName: 'deleteTodo',
              displayArgs: { todoId: '2' },
            },
          ],
        },
      },
    ])

    const approvalEvent = events.find(
      (e) => e.type === 'approval-request'
    ) as any
    assert.ok(approvalEvent)
    assert.equal(approvalEvent.toolCallId, 'tool-call-2')
    assert.equal(approvalEvent.toolName, 'deleteTodo')
    assert.deepEqual(approvalEvent.args, { todoId: '2' })
  })

  test('loops through multiple steps when tools are called', async () => {
    addTestAgent('multi-step-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []
    let callCount = 0

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          callCount++
          if (callCount === 1) {
            return makeStepResult({
              text: 'Calling tool...',
              toolCalls: [
                { toolCallId: 'tc-1', toolName: 'myTool', args: { q: 'test' } },
              ],
              toolResults: [
                {
                  toolCallId: 'tc-1',
                  toolName: 'myTool',
                  result: 'tool result',
                },
              ],
              finishReason: 'tool-calls',
            })
          }
          return makeStepResult({ text: 'Final answer', finishReason: 'stop' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-multi',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'multi-step-agent',
      {
        message: 'hello',
        threadId: 'thread-multi',
        resourceId: 'resource-multi',
      },
      {
        channelId: 'channel-multi',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => {
          events.push(event)
        },
        close: () => {},
      },
      {}
    )

    assert.equal(callCount, 2)
    assert.deepEqual(updates, [
      { runId: 'run-multi', patch: { status: 'completed' } },
    ])
    assert.ok(events.some((e) => e.type === 'done'))
  })

  test('afterStep hook is called for each stream step', async () => {
    addTestAgent('afterstep-stream-agent')

    const afterStepCalls: unknown[] = []
    const middleware: PikkuAIMiddlewareHooks = {
      afterStep: async (_services, ctx) => {
        afterStepCalls.push(ctx)
      },
    }
    const agent = pikkuState(null, 'agent', 'agents').get(
      'afterstep-stream-agent'
    )!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('afterstep-stream-agent', agent)

    let callCount = 0
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => {
          callCount++
          if (callCount === 1) {
            return makeStepResult({
              text: 'step1',
              toolCalls: [
                { toolCallId: 'tc-1', toolName: 'myTool', args: { q: 'x' } },
              ],
              toolResults: [
                { toolCallId: 'tc-1', toolName: 'myTool', result: 'ok' },
              ],
              usage: { inputTokens: 10, outputTokens: 5 },
              finishReason: 'tool-calls',
            })
          }
          return makeStepResult({
            text: 'final',
            finishReason: 'stop',
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-as',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'afterstep-stream-agent',
      { message: 'hi', threadId: 't-as', resourceId: 'r-as' },
      {
        channelId: 'c-as',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      },
      {}
    )

    assert.equal(afterStepCalls.length, 2)
    assert.equal((afterStepCalls[0] as any).stepNumber, 0)
    assert.equal((afterStepCalls[0] as any).finishReason, 'tool-calls')
    assert.equal((afterStepCalls[1] as any).stepNumber, 1)
    assert.equal((afterStepCalls[1] as any).text, 'final')
  })

  test('onError hook is called when stream throws', async () => {
    addTestAgent('onerror-stream-agent')

    const onErrorCalls: unknown[] = []
    const middleware: PikkuAIMiddlewareHooks = {
      onError: async (_services, ctx) => {
        onErrorCalls.push(ctx)
      },
    }
    const agent = pikkuState(null, 'agent', 'agents').get(
      'onerror-stream-agent'
    )!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('onerror-stream-agent', agent)

    const events: AIStreamEvent[] = []
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async () => {
          throw new Error('stream boom')
        },
      },
      aiRunState: {
        createRun: async () => 'run-oe',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'onerror-stream-agent',
      { message: 'hi', threadId: 't-oe', resourceId: 'r-oe' },
      {
        channelId: 'c-oe',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      },
      {}
    )

    assert.equal(onErrorCalls.length, 1)
    assert.equal((onErrorCalls[0] as any).error.message, 'stream boom')
    assert.ok(events.some((e) => e.type === 'error'))
    assert.ok(events.some((e) => e.type === 'done'))
  })

  test('beforeToolCall and afterToolCall hooks fire for tool executions', async () => {
    addTestAgent('toolhooks-stream-agent')

    const hookCalls: { hook: string; ctx: any }[] = []
    const middleware: PikkuAIMiddlewareHooks = {
      beforeToolCall: async (_services, ctx) => {
        hookCalls.push({ hook: 'before', ctx })
        return { args: { ...ctx.args, injected: true } }
      },
      afterToolCall: async (_services, ctx) => {
        hookCalls.push({ hook: 'after', ctx })
        return { result: `modified:${ctx.result}` }
      },
    }
    const agentName = 'toolhooks-stream-agent'
    const agent = pikkuState(null, 'agent', 'agents').get(agentName)!
    agent.aiMiddleware = [middleware] as any
    agent.tools = ['myTool']
    pikkuState(null, 'agent', 'agents').set(agentName, agent)
    pikkuState(null, 'agent', 'agentsMeta')[agentName].tools = ['myTool']
    pikkuState(null, 'rpc', 'meta')['myTool'] = 'myTool'
    pikkuState(null, 'function', 'meta')['myTool'] = {
      description: 'test tool',
    }

    const events: AIStreamEvent[] = []
    let callCount = 0

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (
          params: any,
          _channel: any
        ): Promise<AIAgentStepResult> => {
          callCount++
          if (callCount === 1) {
            const tool = params.tools.find((t: any) => t.name === 'myTool')
            if (tool) {
              try {
                await tool.execute({ q: 'test' })
              } catch {
                // runPikkuFunc not fully mocked; hooks still fire
              }
            }
            return makeStepResult({
              text: 'done',
              finishReason: 'stop',
            })
          }
          return makeStepResult({ text: 'done', finishReason: 'stop' })
        },
      },
      aiRunState: {
        createRun: async () => 'run-th',
        updateRun: async () => {},
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)
    pikkuState(null, 'package', 'createWireServices', () => ({}))

    await streamAIAgent(
      agentName,
      { message: 'hi', threadId: 't-th', resourceId: 'r-th' },
      {
        channelId: 'c-th',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      },
      {}
    )

    assert.equal(hookCalls.length, 2)
    assert.equal(hookCalls[0].hook, 'before')
    assert.equal(hookCalls[0].ctx.toolName, 'myTool')
    assert.deepEqual(hookCalls[0].ctx.args, { q: 'test' })
    assert.equal(hookCalls[1].hook, 'after')
    assert.equal(hookCalls[1].ctx.toolName, 'myTool')
    assert.deepEqual(hookCalls[1].ctx.args, { q: 'test', injected: true })
    assert.ok(hookCalls[1].ctx.durationMs >= 0)
  })

  test('suspends for credential requests and does not emit approval events', async () => {
    addTestAgent('credential-stream-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> =>
          makeStepResult({
            toolCalls: [
              { toolCallId: 'cred-1', toolName: 'secretTool', args: { id: 1 } },
            ],
            toolResults: [
              {
                toolCallId: 'cred-1',
                toolName: 'secretTool',
                result: {
                  __credentialRequired: true,
                  credentialName: 'github',
                  credentialType: 'oauth2',
                  connectUrl: '/connect',
                },
              },
            ],
          }),
      },
      aiRunState: {
        createRun: async () => 'run-cred',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await streamAIAgent(
      'credential-stream-agent',
      {
        message: 'connect',
        threadId: 'thread-cred',
        resourceId: 'resource-cred',
      },
      {
        channelId: 'channel-cred',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      },
      {}
    )

    assert.deepEqual(updates, [
      {
        runId: 'run-cred',
        patch: {
          status: 'suspended',
          suspendReason: 'credential',
          pendingApprovals: [
            {
              type: 'credential-request',
              toolCallId: 'cred-1',
              toolName: 'secretTool',
              args: { id: 1 },
              credentialName: 'github',
              credentialType: 'oauth2',
              connectUrl: '/connect',
            },
          ],
        },
      },
    ])
    assert.ok(events.every((event) => event.type !== 'approval-request'))
    assert.equal(events.at(-1)?.type, 'done')
  })

  test('persists streamed events, applies output stream middleware, and updates usage', async () => {
    addTestAgent('persisted-stream-agent')

    const events: AIStreamEvent[] = []
    const savedMessages: Array<{ threadId: string; messages: AIMessage[] }> = []
    const updates: Array<{ runId: string; patch: unknown }> = []
    const middlewareStateSnapshots: number[] = []

    const middleware: PikkuAIMiddlewareHooks = {
      modifyOutputStream: async (_services, ctx) => {
        const count = Number((ctx.state.count as number | undefined) ?? 0) + 1
        ctx.state.count = count
        middlewareStateSnapshots.push(count)
        if (ctx.event.type === 'text-delta') {
          return [
            ctx.event,
            { type: 'reasoning-delta', text: `seen:${count}` } as AIStreamEvent,
          ]
        }
        return ctx.event
      },
      modifyOutput: async (_services, ctx) => ({
        text: `${ctx.text} [streamed]`,
        messages: ctx.messages,
      }),
    }
    const agent = pikkuState(null, 'agent', 'agents').get(
      'persisted-stream-agent'
    )!
    agent.aiMiddleware = [middleware] as any
    pikkuState(null, 'agent', 'agents').set('persisted-stream-agent', agent)

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (
          _params: any,
          channel: any
        ): Promise<AIAgentStepResult> => {
          channel.send({ type: 'text-delta', text: 'Hello' })
          channel.send({
            type: 'tool-call',
            toolCallId: 'tc-1',
            toolName: 'echo',
            args: { value: 1 },
          })
          channel.send({
            type: 'tool-result',
            toolCallId: 'tc-1',
            toolName: 'echo',
            result: { ok: true },
          })
          channel.send({
            type: 'usage',
            tokens: { input: 3, output: 4 },
            model: 'test/test-model',
          } as AIStreamEvent)
          return makeStepResult({
            text: 'Hello',
            usage: { inputTokens: 3, outputTokens: 4 },
            finishReason: 'stop',
          })
        },
      },
      aiRunState: {
        createRun: async () => 'run-persisted',
        updateRun: async (runId: string, patch: unknown) => {
          updates.push({ runId, patch })
        },
      },
      aiStorage: {
        createThread: async () => {},
        getMessages: async () => [],
        saveMessages: async (threadId: string, messages: AIMessage[]) => {
          savedMessages.push({ threadId, messages })
        },
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    const result = await streamAIAgent(
      'persisted-stream-agent',
      {
        message: 'hello',
        threadId: 'thread-persisted',
        resourceId: 'resource-persisted',
      },
      {
        channelId: 'channel-persisted',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      },
      {}
    )

    assert.equal(result, 'Hello')
    assert.ok(events.some((event) => event.type === 'reasoning-delta'))
    assert.deepEqual(middlewareStateSnapshots, [1, 2, 3, 4])
    assert.equal(savedMessages[0].messages[0].role, 'user')
    assert.equal(savedMessages[1].messages[0].role, 'assistant')
    assert.equal(savedMessages[1].messages[1].role, 'tool')
    assert.deepEqual(updates, [
      {
        runId: 'run-persisted',
        patch: {
          status: 'completed',
          usage: {
            inputTokens: 3,
            outputTokens: 4,
            model: 'test/test-model',
          },
        },
      },
    ])
  })
})

describe('ai-agent-stream helpers', () => {
  test('checkForApprovals expands nested sub-approvals and explicit tool approvals', () => {
    const approvals = checkForApprovals(
      {
        text: '',
        toolCalls: [
          { toolCallId: 'tc-1', toolName: 'toolA', args: { id: 1 } },
          { toolCallId: 'tc-2', toolName: 'toolB', args: { id: 2 } },
        ],
        toolResults: [
          {
            toolCallId: 'tc-2',
            toolName: 'toolB',
            result: {
              __approvalRequired: true,
              toolName: 'sub-agent',
              args: { task: 'x' },
              agentRunId: 'sub-run-1',
              subApprovals: [
                {
                  toolCallId: 'sub-1',
                  toolName: 'deleteTodo',
                  args: { todoId: '1' },
                  runId: 'sub-run-1',
                },
              ],
            },
          },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: 'tool-calls',
      },
      [
        {
          name: 'toolA',
          description: '',
          inputSchema: {},
          execute: async () => {},
          needsApproval: true,
        },
      ],
      'run-1'
    )

    assert.equal(approvals.length, 2)
    assert.ok(approvals[0] instanceof ToolApprovalRequired)
    assert.equal(approvals[0].toolName, 'toolA')
    assert.equal(approvals[1].toolName, 'sub-agent')
    assert.equal(approvals[1].displayToolName, 'deleteTodo')
    assert.equal(approvals[1].agentRunId, 'sub-run-1')
  })

  test('checkForCredentialRequests and appendStepMessages handle structured results', () => {
    const requests = checkForCredentialRequests(
      {
        text: '',
        toolCalls: [
          { toolCallId: 'tc-1', toolName: 'secretTool', args: { id: 1 } },
        ],
        toolResults: [
          {
            toolCallId: 'tc-1',
            toolName: 'secretTool',
            result: {
              __credentialRequired: true,
              credentialName: 'github',
              credentialType: 'oauth2',
              connectUrl: '/connect',
            },
          },
        ],
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: 'tool-calls',
      },
      'run-1'
    )

    assert.equal(requests[0].toolCallId, 'tc-1')
    assert.equal(requests[0].toolName, 'secretTool')
    assert.deepEqual(requests[0].args, { id: 1 })
    assert.equal(requests[0].credentialName, 'github')
    assert.equal(requests[0].credentialType, 'oauth2')
    assert.equal(requests[0].connectUrl, '/connect')

    const runnerParams = { messages: [] as AIMessage[] } as any
    appendStepMessages(runnerParams, {
      text: 'hello',
      toolCalls: [
        { toolCallId: 'tc-1', toolName: 'secretTool', args: { id: 1 } },
      ],
      toolResults: [
        { toolCallId: 'tc-1', toolName: 'secretTool', result: { ok: true } },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
      finishReason: 'tool-calls',
    })

    assert.equal(runnerParams.messages.length, 2)
    assert.equal(runnerParams.messages[0].role, 'assistant')
    assert.equal(runnerParams.messages[1].role, 'tool')
    assert.equal(
      runnerParams.messages[1].toolResults[0].result,
      JSON.stringify({ ok: true })
    )
  })
})

describe('resumeAIAgent', () => {
  test('rejecting one approval while others remain only resolves and finishes the stream', async () => {
    addTestAgent('resume-stream-agent')

    const events: AIStreamEvent[] = []
    const updates: any[] = []
    const resolveCalls: any[] = []
    const savedMessages: any[] = []
    let remainingRun: AgentRunState

    const initialRun: AgentRunState = {
      runId: 'run-1',
      agentName: 'resume-stream-agent',
      threadId: 'thread-1',
      resourceId: 'resource-1',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'deploy',
          args: { env: 'prod' },
        },
        {
          type: 'tool-call',
          toolCallId: 'tool-2',
          toolName: 'deploy',
          args: { env: 'stage' },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    remainingRun = {
      ...initialRun,
      pendingApprovals: [initialRun.pendingApprovals![1]],
    }

    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async () => {
          throw new Error('should not continue')
        },
      },
      aiRunState: {
        getRun: async () => remainingRun,
        resolveApproval: async (toolCallId: string, status: string) => {
          resolveCalls.push({ toolCallId, status })
        },
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
      },
      aiStorage: {
        saveMessages: async (_threadId: string, messages: AIMessage[]) => {
          savedMessages.push(messages)
        },
      },
    } as any

    let first = true
    mockServices.aiRunState.getRun = async () => {
      if (first) {
        first = false
        return initialRun
      }
      return remainingRun
    }

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await resumeAIAgent(
      { runId: 'run-1', toolCallId: 'tool-1', approved: false },
      {
        channelId: 'resume-channel',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      },
      {}
    )

    assert.deepEqual(resolveCalls, [{ toolCallId: 'tool-1', status: 'denied' }])
    assert.match(
      savedMessages[0][0].toolResults[0].result,
      /explicitly declined/
    )
    assert.deepEqual(updates, [])
    assert.equal(events.at(-1)?.type, 'done')
  })

  test('approving a tool executes it, streams the result, and resumes completion', async () => {
    addTestAgent('resume-stream-agent')
    pikkuState(null, 'agent', 'agentsMeta')['resume-stream-agent'].tools = [
      'deploy',
    ]
    pikkuState(null, 'rpc', 'meta').deploy = 'deploy'
    pikkuState(null, 'function', 'meta').deploy = {
      description: 'Deploy',
      inputSchemaName: 'DeployInput',
      sessionless: true,
    }
    pikkuState(null, 'misc', 'schemas').set('DeployInput', {
      type: 'object',
      properties: { env: { type: 'string' } },
    })
    pikkuState(null, 'function', 'functions').set('deploy', {
      func: async (_services: any, input: any) => ({ deployed: input.env }),
    })

    const events: AIStreamEvent[] = []
    const updates: any[] = []
    const resolveCalls: any[] = []
    const savedMessages: any[] = []

    const run: AgentRunState = {
      runId: 'run-approve',
      agentName: 'resume-stream-agent',
      threadId: 'thread-approve',
      resourceId: 'resource-approve',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'deploy',
          args: { env: 'prod' },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    let getRunCalls = 0
    const mockServices = {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (
          _params: any,
          channel: any
        ): Promise<AIAgentStepResult> => {
          channel.send({ type: 'text-delta', text: 'continued' })
          channel.send({
            type: 'usage',
            tokens: { input: 2, output: 3 },
            model: 'test/test-model',
          } as AIStreamEvent)
          return makeStepResult({
            text: 'continued',
            usage: { inputTokens: 2, outputTokens: 3 },
            finishReason: 'stop',
          })
        },
      },
      aiRunState: {
        getRun: async () => {
          getRunCalls++
          return getRunCalls === 1 ? run : { ...run, pendingApprovals: [] }
        },
        resolveApproval: async (toolCallId: string, status: string) => {
          resolveCalls.push({ toolCallId, status })
        },
        updateRun: async (_runId: string, patch: any) => {
          updates.push(patch)
        },
      },
      aiStorage: {
        saveMessages: async (_threadId: string, messages: AIMessage[]) => {
          savedMessages.push(messages)
        },
        getMessages: async () => [],
      },
    } as any

    pikkuState(null, 'package', 'singletonServices', mockServices)

    await resumeAIAgent(
      { runId: 'run-approve', toolCallId: 'tool-1', approved: true },
      {
        channelId: 'resume-channel',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      },
      {}
    )

    assert.deepEqual(resolveCalls, [
      { toolCallId: 'tool-1', status: 'approved' },
    ])
    assert.equal(events[0].type, 'tool-result')
    assert.equal(events.at(-1)?.type, 'done')
    assert.deepEqual(updates, [
      { status: 'running' },
      {
        status: 'completed',
        usage: { inputTokens: 2, outputTokens: 3, model: 'test/test-model' },
      },
    ])
    assert.equal(savedMessages.length, 2)
  })
})
