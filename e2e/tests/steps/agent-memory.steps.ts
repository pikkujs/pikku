import { Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { callRpcAs } from '../support/sse.js'
import { config } from '../support/types.js'

type MockLlmCall = {
  userMessage: string
  messages: any[]
}

const callsFor = async (message: string): Promise<MockLlmCall[]> => {
  const res = await fetch(`${config.apiUrl}/rpc/llmCallLog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const log = (await res.json()) as MockLlmCall[]
  return log.filter((c) => c.userMessage === message)
}

/**
 * A later turn on the same thread must carry the earlier turn's history into the
 * model call — that replay is the whole point of a persisted thread, and it is
 * visible in what the scripted model was handed on the second request.
 */
Then(
  'the model call for {string} replays the earlier message {string}',
  async function (this: AgentWorld, message: string, earlier: string) {
    const calls = await callsFor(message)
    expect(
      calls.length,
      `no model call recorded for "${message}"`
    ).toBeGreaterThan(0)
    expect(JSON.stringify(calls[0]!.messages)).toContain(earlier)
  }
)

Then(
  'the model call for {string} does not replay the message {string}',
  async function (this: AgentWorld, message: string, foreign: string) {
    const calls = await callsFor(message)
    expect(calls.length).toBeGreaterThan(0)
    expect(JSON.stringify(calls[0]!.messages)).not.toContain(foreign)
  }
)

Then(
  'user {string} reading the thread sees a message containing {string}',
  async function (this: AgentWorld, userId: string, text: string) {
    const { body } = await callRpcAs({ userId }, 'getAgentThreadMessages', {
      threadId: this.threadId,
    })
    const messages = Array.isArray(body) ? body : []
    expect(JSON.stringify(messages)).toContain(text)
  }
)

Then(
  'user {string} reading the thread sees a {string} message',
  async function (this: AgentWorld, userId: string, role: string) {
    const { body } = await callRpcAs({ userId }, 'getAgentThreadMessages', {
      threadId: this.threadId,
    })
    const roles = (Array.isArray(body) ? body : []).map((m: any) => m.role)
    expect(roles).toContain(role)
  }
)

Then(
  'user {string} reading the thread runs sees {int} run(s)',
  async function (this: AgentWorld, userId: string, count: number) {
    const { body } = await callRpcAs({ userId }, 'getAgentThreadRuns', {
      threadId: this.threadId,
    })
    expect(Array.isArray(body) ? body.length : 0).toBe(count)
  }
)
