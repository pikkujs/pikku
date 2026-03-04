import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { streamAIAgent } from './ai-agent-stream.js'
import { ToolApprovalRequired } from './ai-agent-prepare.js'
import type {
  CoreAIAgent,
  AIStreamEvent,
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
})
