import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { callAgentAs, callRpcAs, identityHeaders } from '../support/sse.js'
import { config } from '../support/types.js'

declare module '../support/world.js' {
  interface AgentWorld {
    approvalAgent?: string
    approvalUser?: string
  }
}

type PendingApproval = {
  toolCallId: string
  toolName: string
  reason: string
}

const pending = (world: AgentWorld): PendingApproval[] =>
  (world.agentResponse?.body?.pendingApprovals as PendingApproval[]) ?? []

const resolveAll = async (world: AgentWorld, approved: boolean) => {
  const res = await fetch(
    `${config.apiUrl}/rpc/agent/${world.approvalAgent}/approve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...identityHeaders({ userId: world.approvalUser }),
      },
      body: JSON.stringify({
        runId: world.agentResponse?.body?.runId,
        approvals: pending(world).map((p) => ({
          toolCallId: p.toolCallId,
          approved,
        })),
      }),
    }
  )
  const text = await res.text()
  world.agentResponse = { status: res.status, body: JSON.parse(text) }
}

When(
  'I run approval agent {string} as {string} with script {string} and message {string}',
  async function (
    this: AgentWorld,
    agent: string,
    userId: string,
    script: string,
    message: string
  ) {
    this.agentMessage = message
    this.approvalAgent = agent
    this.approvalUser = userId
    this.agentResponse = await callAgentAs({ userId }, agent, {
      message,
      threadId: this.threadId,
      resourceId: 'agent-approval',
      model: `mock/${script}`,
    })
  }
)

Then('the run is suspended for approval', function (this: AgentWorld) {
  expect(this.agentResponse?.body?.status).toBe('suspended')
})

Then(
  'there are {int} pending approvals',
  function (this: AgentWorld, count: number) {
    expect(pending(this).length).toBe(count)
  }
)

Then(
  'a pending approval reason contains {string}',
  function (this: AgentWorld, text: string) {
    const reasons = pending(this).map((p) => p.reason)
    expect(
      reasons.some((r) => r.includes(text)),
      `no pending approval reason contains "${text}". Got: ${JSON.stringify(reasons)}`
    ).toBe(true)
  }
)

When('I approve all pending tool calls', async function (this: AgentWorld) {
  await resolveAll(this, true)
})

When('I deny all pending tool calls', async function (this: AgentWorld) {
  await resolveAll(this, false)
})

Then('the run is no longer suspended', function (this: AgentWorld) {
  expect(this.agentResponse?.body?.status).not.toBe('suspended')
  expect(this.agentResponse?.status).toBe(200)
})

Then(
  'the todo list does not contain {string}',
  async function (this: AgentWorld, title: string) {
    const res = await fetch(`${config.apiUrl}/rpc/todos:listTodos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    })
    const { todos } = (await res.json()) as { todos: { title: string }[] }
    const titles = todos.map((t) => t.title)
    expect(
      titles.every((t) => !t.toLowerCase().includes(title.toLowerCase())),
      `todo "${title}" should be absent but the store has: ${JSON.stringify(titles)}`
    ).toBe(true)
  }
)

/**
 * The store keys todos by a millisecond timestamp id, so three adds in one turn
 * collapse to one row — an addon quirk, not the framework. The framework-level
 * observable is that every approved tool actually executed, which shows up as a
 * tool-result message per call in the persisted thread.
 */
Then(
  'the thread recorded {int} tool executions of {string}',
  async function (this: AgentWorld, count: number, toolName: string) {
    const { body } = await callRpcAs(
      { userId: this.approvalUser },
      'getAgentThreadMessages',
      { threadId: this.threadId }
    )
    const messages = Array.isArray(body) ? body : []
    const results = messages
      .filter((m: any) => m.role === 'tool')
      .flatMap((m: any) => m.toolResults ?? [])
      .filter((r: any) => r.name === toolName)
    expect(results.length).toBe(count)
  }
)
