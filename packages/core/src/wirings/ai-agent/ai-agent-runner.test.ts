import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { runAIAgent } from './ai-agent-runner.js'
import type { CoreAIAgent, PikkuAIMiddlewareHooks } from './ai-agent.types.js'
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

describe('runAIAgent', () => {
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

    assert.deepEqual(updates, [{ status: 'failed' }])
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
})
