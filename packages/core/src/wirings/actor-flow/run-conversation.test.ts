import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { runConversation, type PersonaLLM } from './run-conversation.js'
import type {
  TargetAgentDriver,
  TargetAgentReply,
  ActorFlowApprovalPolicy,
} from './actor-flow.types.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'

const stepResult = (object: unknown): AIAgentStepResult => ({
  text: '',
  object,
  toolCalls: [],
  toolResults: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  finishReason: 'stop',
})

/** A persona LLM scripted by the outputSchema it's asked for. */
const scriptedLLM = (script: {
  turns: Array<{ message: string; done: boolean }>
  decisions: Array<{ toolCallId: string; approved: boolean }>
  evaluation: { passed: boolean; reasoning: string }
}): { llm: PersonaLLM; calls: string[] } => {
  let turn = 0
  const calls: string[] = []
  const llm: PersonaLLM = async (params) => {
    const props =
      (params.outputSchema as { properties?: Record<string, unknown> })
        ?.properties ?? {}
    if ('message' in props) {
      // Providers reject an empty prompt — every persona turn must carry messages.
      assert.ok(
        params.messages.length > 0,
        'persona turn requested with empty messages'
      )
      const t = script.turns[turn] ?? script.turns[script.turns.length - 1]
      turn++
      calls.push('turn')
      return stepResult(t)
    }
    if ('decisions' in props) {
      calls.push('approval')
      return stepResult({ decisions: script.decisions })
    }
    if ('passed' in props) {
      calls.push('eval')
      return stepResult(script.evaluation)
    }
    throw new Error('unexpected schema')
  }
  return { llm, calls }
}

/** A target that suspends once for approval, then completes. */
const suspendingTarget = (): {
  target: TargetAgentDriver
  approvedWith: Array<{ toolCallId: string; approved: boolean }[]>
} => {
  let runs = 0
  const approvedWith: Array<{ toolCallId: string; approved: boolean }[]> = []
  const target: TargetAgentDriver = {
    run: async (): Promise<TargetAgentReply> => {
      runs++
      if (runs === 1) {
        return {
          text: 'Let me do that.',
          runId: 'run-1',
          status: 'suspended',
          pendingApprovals: [
            { toolCallId: 'tc1', toolName: 'createTodo', args: { title: 'x' } },
          ],
        }
      }
      return { text: 'All set.', runId: `run-${runs}`, status: 'completed' }
    },
    approve: async (runId, decisions): Promise<TargetAgentReply> => {
      approvedWith.push(decisions)
      return { text: 'Created it.', runId, status: 'completed' }
    },
  }
  return { target, approvedWith }
}

/** A target that never completes — always re-suspends for the same approval. */
const alwaysSuspendingTarget = (): {
  target: TargetAgentDriver
  approveCalls: () => number
} => {
  let approveCalls = 0
  const suspended: TargetAgentReply = {
    text: 'working on it',
    runId: 'run-stuck',
    status: 'suspended',
    pendingApprovals: [
      { toolCallId: 'tc1', toolName: 'createTodo', args: { title: 'x' } },
    ],
  }
  const target: TargetAgentDriver = {
    run: async () => suspended,
    approve: async () => {
      approveCalls++
      return suspended
    },
  }
  return { target, approveCalls: () => approveCalls }
}

const base = {
  persona: { email: 'pm@example.com', name: 'Priya', personality: 'concise' },
  personaName: 'Priya',
  agentName: 'todoBot',
  task: 'Get a todo created',
  evaluate: 'A todo now exists',
  model: 'test/test-model',
}

describe('runConversation', () => {
  test('drives turns, approves in-persona, evaluates', async () => {
    const { llm, calls } = scriptedLLM({
      turns: [
        { message: 'please make a todo', done: false },
        { message: 'thanks', done: true },
      ],
      decisions: [{ toolCallId: 'tc1', approved: true }],
      evaluation: { passed: true, reasoning: 'todo created' },
    })
    const { target, approvedWith } = suspendingTarget()

    const verdict = await runConversation({ ...base, llm, target })

    assert.equal(verdict.passed, true)
    assert.match(verdict.reasoning, /todo/i)
    assert.ok(verdict.transcript.length >= 2)
    assert.deepEqual(approvedWith, [[{ toolCallId: 'tc1', approved: true }]])
    assert.ok(calls.includes('approval'))
    assert.ok(calls.includes('eval'))
  })

  test("approvals policy 'never' denies without asking the persona", async () => {
    const { llm, calls } = scriptedLLM({
      turns: [{ message: 'make a todo', done: true }],
      decisions: [{ toolCallId: 'tc1', approved: true }],
      evaluation: { passed: false, reasoning: 'blocked' },
    })
    const { target, approvedWith } = suspendingTarget()

    const verdict = await runConversation({
      ...base,
      approvals: 'never' as ActorFlowApprovalPolicy,
      llm,
      target,
    })

    assert.deepEqual(approvedWith, [[{ toolCallId: 'tc1', approved: false }]])
    assert.ok(!calls.includes('approval'))
    assert.equal(verdict.passed, false)
  })

  test('caps the approval loop when the target never stops suspending', async () => {
    const { llm } = scriptedLLM({
      turns: [{ message: 'please make a todo', done: false }],
      decisions: [{ toolCallId: 'tc1', approved: true }],
      evaluation: { passed: false, reasoning: 'never got there' },
    })
    const { target, approveCalls } = alwaysSuspendingTarget()

    await assert.rejects(
      runConversation({ ...base, approvals: 'always', maxApprovalRounds: 3, llm, target }),
      /approval rounds/
    )
    assert.equal(approveCalls(), 3)
  })
})
