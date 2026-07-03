import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import { runActorFlow } from './run-actor-flow.js'
import { InMemoryAIRunStateService } from '../../services/in-memory-ai-run-state-service.js'
import type { CoreAIAgent } from '../ai-agent/ai-agent.types.js'
import type {
  AIAgentRunnerParams,
  AIAgentStepResult,
} from '../../services/ai-agent-runner-service.js'
import type { UserFlowActor } from '../../services/user-flow-actors-service.js'
import type { CoreActorFlow } from './actor-flow.types.js'

beforeEach(() => {
  resetPikkuState()
})

/** Register a target agent that exposes a single approval-gated `createTodo` tool. */
const registerTodoBot = (onCreateTodo: (input: unknown) => unknown) => {
  const agent: CoreAIAgent = {
    name: 'todoBot',
    description: 'creates todos',
    instructions: 'help the user manage todos',
    model: 'test/test-model',
  }
  pikkuState(null, 'agent', 'agentsMeta')['todoBot'] = {
    ...agent,
    tools: ['createTodo'],
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  }
  pikkuState(null, 'agent', 'agents').set('todoBot', agent)

  pikkuState(null, 'rpc', 'meta').createTodo = 'createTodo'
  pikkuState(null, 'function', 'meta').createTodo = {
    description: 'Create a todo',
    approvalRequired: true,
    inputSchemaName: 'CreateTodoInput',
    sessionless: true,
  }
  pikkuState(null, 'misc', 'schemas').set('CreateTodoInput', {
    type: 'object',
    properties: { title: { type: 'string' } },
  })
  pikkuState(null, 'function', 'functions').set('createTodo', {
    func: async (_services: unknown, input: unknown) => onCreateTodo(input),
  })
}

const stepResult = (
  overrides?: Partial<AIAgentStepResult>
): AIAgentStepResult => ({
  text: '',
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  finishReason: 'stop',
  ...overrides,
})

/**
 * A scripted LLM runner. Target-agent calls (agentId 'todoBot') request the
 * createTodo tool once, then reply with text. Persona calls are routed by their
 * outputSchema: a turn, an approval decision, or the final evaluation.
 */
const makeScriptedRunner = (script: {
  personaTurns: Array<{ message: string; done: boolean }>
  approvals: (pendingSummary: string) => {
    decisions: Array<{ toolCallId: string; approved: boolean }>
  }
  evaluation: { passed: boolean; reasoning: string }
}) => {
  let personaTurn = 0
  let targetCalls = 0
  const runCalls: string[] = []

  return {
    runCalls,
    run: async (params: AIAgentRunnerParams): Promise<AIAgentStepResult> => {
      if (params.agentId === 'todoBot') {
        targetCalls++
        runCalls.push(`target#${targetCalls}`)
        if (targetCalls === 1) {
          return stepResult({
            text: 'Let me create that for you.',
            toolCalls: [
              {
                toolCallId: 'tc-createTodo',
                toolName: 'createTodo',
                args: { title: 'Launch todo' },
              },
            ],
            finishReason: 'tool-calls',
          })
        }
        return stepResult({ text: 'Done — I created your launch todo.' })
      }

      const props =
        (params.outputSchema as { properties?: Record<string, unknown> })
          ?.properties ?? {}

      if ('message' in props) {
        const turn =
          script.personaTurns[personaTurn] ??
          script.personaTurns[script.personaTurns.length - 1]
        personaTurn++
        runCalls.push(`persona-turn:${turn.message}`)
        return stepResult({ object: turn })
      }
      if ('decisions' in props) {
        runCalls.push('persona-approval')
        const last = params.messages[params.messages.length - 1]
        const summary = typeof last?.content === 'string' ? last.content : ''
        return stepResult({ object: script.approvals(summary) })
      }
      if ('passed' in props) {
        runCalls.push('persona-eval')
        return stepResult({ object: script.evaluation })
      }
      throw new Error('unexpected persona run without a recognised schema')
    },
  }
}

const installServices = (runner: { run: unknown }) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    aiAgentRunner: runner,
    aiRunState: new InMemoryAIRunStateService(),
    aiStorage: {
      createThread: async () => {},
      getMessages: async () => [],
      saveMessages: async () => {},
    },
  } as any)
}

const fakeActor = (invoke: UserFlowActor['invoke']): UserFlowActor => ({
  name: 'pm',
  email: 'pm@example.com',
  invoke,
})

describe('runActorFlow', () => {
  test('drives the conversation, approves in-persona, evaluates and verifies', async () => {
    const created: unknown[] = []
    registerTodoBot((input) => {
      created.push(input)
      return { id: 'todo-1', ...(input as object) }
    })

    const runner = makeScriptedRunner({
      personaTurns: [
        { message: 'Please create a todo for the launch', done: false },
        { message: 'Great, thanks', done: true },
      ],
      approvals: () => ({
        decisions: [{ toolCallId: 'tc-createTodo', approved: true }],
      }),
      evaluation: { passed: true, reasoning: 'The launch todo was created.' },
    })
    installServices(runner)

    const flow: CoreActorFlow = {
      actor: fakeActor(async () => [{ title: 'Launch todo' }]),
      agent: 'todoBot',
      task: 'Get a todo created for the launch',
      evaluate: 'A todo about the launch now exists',
      verify: async ({ actor }) => {
        const todos = (await actor.invoke('getTodos', {})) as Array<{
          title: string
        }>
        if (!todos.some((t) => /launch/i.test(t.title))) {
          throw new Error('no launch todo')
        }
      },
    }

    const verdict = await runActorFlow({
      flow,
      persona: {
        email: 'pm@example.com',
        name: 'Priya',
        jobTitle: 'Product Manager',
        personality: 'outcome-focused, concise',
      },
      model: 'test/test-model',
    })

    assert.equal(verdict.passed, true)
    assert.equal(verdict.verifyError, undefined)
    assert.match(verdict.reasoning, /launch/i)
    // The approval-gated tool actually ran (approval was granted and replayed).
    assert.deepEqual(created, [{ title: 'Launch todo' }])
    assert.ok(runner.runCalls.includes('persona-approval'))
    assert.ok(runner.runCalls.includes('persona-eval'))
  })

  test('a failing verify hook fails the flow even when the LLM says passed', async () => {
    registerTodoBot(() => ({ id: 'todo-1' }))

    const runner = makeScriptedRunner({
      personaTurns: [{ message: 'make a todo', done: true }],
      approvals: () => ({
        decisions: [{ toolCallId: 'tc-createTodo', approved: true }],
      }),
      evaluation: { passed: true, reasoning: 'looked fine' },
    })
    installServices(runner)

    const flow: CoreActorFlow = {
      actor: fakeActor(async () => []),
      agent: 'todoBot',
      task: 'Create a todo',
      evaluate: 'A todo exists',
      verify: async () => {
        throw new Error('DB had no matching row')
      },
    }

    const verdict = await runActorFlow({
      flow,
      persona: { email: 'pm@example.com', name: 'Priya' },
      model: 'test/test-model',
    })

    assert.equal(verdict.passed, false)
    assert.equal(verdict.verifyError, 'DB had no matching row')
  })

  test("approvals policy 'never' denies the tool so it never runs", async () => {
    const created: unknown[] = []
    registerTodoBot((input) => {
      created.push(input)
      return { id: 'todo-1' }
    })

    const runner = makeScriptedRunner({
      personaTurns: [{ message: 'make a todo', done: true }],
      approvals: () => ({ decisions: [] }),
      evaluation: { passed: false, reasoning: 'was blocked' },
    })
    installServices(runner)

    const flow: CoreActorFlow = {
      actor: fakeActor(async () => []),
      agent: 'todoBot',
      task: 'Create a todo',
      approvals: 'never',
      evaluate: 'A todo exists',
    }

    const verdict = await runActorFlow({
      flow,
      persona: { email: 'pm@example.com', name: 'Priya' },
      model: 'test/test-model',
    })

    assert.equal(created.length, 0)
    assert.ok(!runner.runCalls.includes('persona-approval'))
    assert.equal(verdict.passed, false)
  })
})
