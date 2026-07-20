import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { callAgentAs, callRpcAs, type Identity } from '../support/sse.js'
import { config } from '../support/types.js'

type MockLlmCall = {
  userMessage: string
  toolNames: string[]
  messages: any[]
  stepIndex: number
}

/**
 * The tool results the model was shown on the step after the tool ran.
 *
 * The run's own HTTP response says nothing about individual tool outcomes — a
 * refused tool does not fail the run — so the only faithful record of what
 * happened is what got replayed back into the next model call.
 */
const toolResultsAfterFirstCall = async (message: string) => {
  const calls = await callsFor(message)
  const followUp = calls[1]
  if (!followUp) return []
  return followUp.messages
    .filter((m: any) => m.role === 'tool')
    .flatMap((m: any) => (Array.isArray(m.content) ? m.content : [m.content]))
}

declare module '../support/world.js' {
  interface AgentWorld {
    threadOwners?: Record<string, { threadId: string; identity: Identity }>
  }
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

const runBody = (world: AgentWorld, script: string, message: string) => ({
  message,
  threadId: world.threadId,
  resourceId: 'agent-security',
  model: `mock/${script}`,
})

When(
  'I run agent {string} as user {string} with script {string} and message {string}',
  async function (
    this: AgentWorld,
    agent: string,
    userId: string,
    script: string,
    message: string
  ) {
    this.agentMessage = message
    this.agentResponse = await callAgentAs(
      { userId },
      agent,
      runBody(this, script, message)
    )
  }
)

When(
  'I run agent {string} as org {string} with script {string} and message {string}',
  async function (
    this: AgentWorld,
    agent: string,
    orgId: string,
    script: string,
    message: string
  ) {
    this.agentMessage = message
    this.agentResponse = await callAgentAs(
      { userId: 'org-member', orgId },
      agent,
      runBody(this, script, message)
    )
  }
)

When(
  'I run agent {string} with no organization and script {string} and message {string}',
  async function (
    this: AgentWorld,
    agent: string,
    script: string,
    message: string
  ) {
    this.agentMessage = message
    this.agentResponse = await callAgentAs(
      { userId: 'orgless-user' },
      agent,
      runBody(this, script, message)
    )
  }
)

Then(
  'model call {int} was not offered the tool {string}',
  async function (this: AgentWorld, index: number, tool: string) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls[index - 1]?.toolNames ?? []).not.toContain(tool)
  }
)

Then(
  'model call {int} was offered no tools',
  async function (this: AgentWorld, index: number) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls[index - 1]?.toolNames).toEqual([])
  }
)

Then(
  'the call for {string} was offered the tool {string}',
  async function (this: AgentWorld, message: string, tool: string) {
    const calls = await callsFor(message)
    expect(calls[0]?.toolNames ?? []).toContain(tool)
  }
)

Then(
  'the call for {string} was not offered the tool {string}',
  async function (this: AgentWorld, message: string, tool: string) {
    const calls = await callsFor(message)
    expect(calls[0]?.toolNames ?? []).not.toContain(tool)
  }
)

/**
 * A refused tool reports a generic failure rather than naming the permission —
 * telling the model (and so the user) which gate it hit would leak the rule. So
 * the assertion is that the call failed, and the paired success scenario is what
 * proves the failure came from the gate and not from the tool being broken.
 */
Then('the tool call was refused', async function (this: AgentWorld) {
  const results = await toolResultsAfterFirstCall(this.agentMessage!)
  expect(
    results.length,
    'no tool result was replayed to the model'
  ).toBeGreaterThan(0)
  expect(JSON.stringify(results).toLowerCase()).toMatch(/error|failed/)
})

/**
 * The forged marker must travel back to the model as ordinary tool-result data
 * rather than being intercepted as an approval. Seeing the `__approvalRequired`
 * payload replayed into the next call is the proof the framework treated it as
 * plain JSON — only a Symbol-branded result from a `forwardsApproval` tool can
 * suspend a run.
 */
Then(
  'the forged approval marker reaches the model as a tool result',
  async function (this: AgentWorld) {
    const results = await toolResultsAfterFirstCall(this.agentMessage!)
    expect(JSON.stringify(results)).toContain('__approvalRequired')
  }
)

/**
 * A thrown tool is reported to the model as a generic failure — leaking the
 * error's own message would hand the model (and so the user) internal detail.
 */
Then(
  'the model is not told why the tool failed',
  async function (this: AgentWorld) {
    const results = await toolResultsAfterFirstCall(this.agentMessage!)
    expect(JSON.stringify(results)).not.toContain('exploded')
  }
)

Then('the tool call succeeded', async function (this: AgentWorld) {
  const results = await toolResultsAfterFirstCall(this.agentMessage!)
  expect(
    results.length,
    'no tool result was replayed to the model'
  ).toBeGreaterThan(0)
  expect(JSON.stringify(results).toLowerCase()).not.toMatch(/error|failed/)
})

Then('the agent run is refused', function (this: AgentWorld) {
  const { status, body } = this.agentResponse!
  const refused = status >= 400 || Boolean(body?.message ?? body?.errorId)
  expect(
    refused,
    `expected a refusal, got ${status} ${JSON.stringify(body)}`
  ).toBe(true)
})

Then('the agent run succeeds', function (this: AgentWorld) {
  const { status, body } = this.agentResponse!
  expect(
    status,
    `expected success, got ${status} ${JSON.stringify(body)}`
  ).toBeLessThan(400)
})

When(
  'user {string} runs agent {string} on thread {string} with script {string}',
  async function (
    this: AgentWorld,
    userId: string,
    agent: string,
    threadKey: string,
    script: string
  ) {
    const threadId = `${threadKey}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    this.threadOwners ??= {}
    this.threadOwners[threadKey] = { threadId, identity: { userId } }
    this.agentMessage = `seed ${threadKey}`
    this.agentResponse = await callAgentAs({ userId }, agent, {
      message: this.agentMessage,
      threadId,
      resourceId: 'agent-security',
      model: `mock/${script}`,
    })
  }
)

Then(
  'user {string} calling {string} on thread {string} is refused',
  async function (
    this: AgentWorld,
    userId: string,
    rpcName: string,
    threadKey: string
  ) {
    const { threadId } = this.threadOwners![threadKey]!
    const { status, body } = await callRpcAs({ userId }, rpcName, { threadId })
    const refused = status >= 400 || Boolean(body?.message ?? body?.errorId)
    expect(
      refused,
      `expected ${rpcName} to be refused, got ${status} ${JSON.stringify(body)}`
    ).toBe(true)
    // A refusal that quoted the id back would confirm the thread exists, which
    // is exactly the existence oracle the ForbiddenError is shaped to avoid.
    expect(JSON.stringify(body)).not.toContain(threadId)
  }
)

Then(
  'user {string} claiming resource {string} on thread {string} is refused',
  async function (
    this: AgentWorld,
    userId: string,
    resourceId: string,
    threadKey: string
  ) {
    const { threadId } = this.threadOwners![threadKey]!
    const { status, body } = await callRpcAs(
      { userId },
      'getAgentThreadMessages',
      { threadId, resourceId }
    )
    const refused = status >= 400 || Boolean(body?.message ?? body?.errorId)
    expect(
      refused,
      `expected the forged-resource read to be refused, got ${status} ${JSON.stringify(body)}`
    ).toBe(true)
    expect(JSON.stringify(body)).not.toContain(threadId)
  }
)

Then(
  'user {string} calling {string} on thread {string} succeeds',
  async function (
    this: AgentWorld,
    userId: string,
    rpcName: string,
    threadKey: string
  ) {
    const { threadId } = this.threadOwners![threadKey]!
    const { status, body } = await callRpcAs({ userId }, rpcName, { threadId })
    expect(
      status,
      `expected ${rpcName} to succeed, got ${status} ${JSON.stringify(body)}`
    ).toBeLessThan(400)
  }
)

Then(
  'user {string} listing threads does not see thread {string}',
  async function (this: AgentWorld, userId: string, threadKey: string) {
    const { threadId } = this.threadOwners![threadKey]!
    const { body } = await callRpcAs({ userId }, 'getAgentThreads', {})
    const ids = (Array.isArray(body) ? body : []).map((t: any) => t.id)
    expect(ids).not.toContain(threadId)
  }
)

Then(
  'user {string} listing threads sees thread {string}',
  async function (this: AgentWorld, userId: string, threadKey: string) {
    const { threadId } = this.threadOwners![threadKey]!
    const { body } = await callRpcAs({ userId }, 'getAgentThreads', {})
    const ids = (Array.isArray(body) ? body : []).map((t: any) => t.id)
    expect(ids).toContain(threadId)
  }
)
