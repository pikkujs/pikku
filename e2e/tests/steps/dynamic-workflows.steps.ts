import { When, Then, Before } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { config } from '../support/types.js'
import { randomUUID } from 'crypto'

interface DynamicWorkflowState {
  agentResponse: any
  consoleResponse: any
  rpcResponse: any
  threadId: string
  lastAgentName: string
}

const state: DynamicWorkflowState = {
  agentResponse: undefined,
  consoleResponse: undefined,
  rpcResponse: undefined,
  threadId: randomUUID(),
  lastAgentName: '',
}

Before({ tags: '@dynamic-workflows or @dynamic-workflow-modes' }, async function () {
  state.threadId = randomUUID()
  state.agentResponse = undefined
  state.consoleResponse = undefined
  state.rpcResponse = undefined
  state.lastAgentName = ''
  await fetch(`${config.apiUrl}/rpc/todos:resetTodos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
})

When(
  'I send the agent {string} the message {string}',
  { timeout: 60_000 },
  async function (agentName: string, message: string) {
    state.lastAgentName = agentName
    const res = await fetch(`${config.apiUrl}/rpc/agent/${agentName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentName,
        message,
        threadId: state.threadId,
        resourceId: 'default',
      }),
    })
    state.agentResponse = await res.json()
  }
)

When(
  'I approve all pending approvals',
  { timeout: 120_000 },
  async function () {
    let response = state.agentResponse
    let safety = 10
    while (safety-- > 0 && response?.pendingApprovals?.length > 0) {
      const runId = response.runId ?? response.pendingApprovals[0]?.runId
      const approvals = response.pendingApprovals.map((a: any) => ({
        toolCallId: a.toolCallId,
        approved: true,
      }))
      const res = await fetch(
        `${config.apiUrl}/rpc/agent/${state.lastAgentName}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentName: state.lastAgentName,
            runId,
            approvals,
          }),
        }
      )
      response = await res.json()
      state.agentResponse = response
    }
  }
)

Then('the agent response should contain {string}', function (expected: string) {
  const text = JSON.stringify(state.agentResponse).toLowerCase()
  expect(text).toContain(expected.toLowerCase())
})

Then(
  'the agent response should not contain {string}',
  function (unexpected: string) {
    const text = JSON.stringify(state.agentResponse).toLowerCase()
    expect(text).not.toContain(unexpected.toLowerCase())
  }
)

When(
  'I query the console RPC {string}',
  { timeout: 30_000 },
  async function (rpcName: string) {
    const res = await fetch(`${config.apiUrl}/rpc/${rpcName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    state.consoleResponse = await res.json()
  }
)

Then(
  'the console response should contain the workflow {string}',
  function (workflowName: string) {
    expect(Array.isArray(state.consoleResponse)).toBeTruthy()
    const names = state.consoleResponse.map((r: any) =>
      typeof r === 'string' ? r : r.name || r.workflowName
    )
    expect(names).toContain(workflowName)
  }
)

Then(
  'the console response should have a run for {string} with status {string}',
  { timeout: 60_000 },
  async function (workflowName: string, expectedStatus: string) {
    const maxWait = 50_000
    const interval = 2_000
    let elapsed = 0
    while (elapsed < maxWait) {
      const res = await fetch(`${config.apiUrl}/rpc/console:getWorkflowRuns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      state.consoleResponse = await res.json()
      if (Array.isArray(state.consoleResponse)) {
        const run = state.consoleResponse.find(
          (r: any) =>
            (r.workflowName || r.workflow) === workflowName &&
            r.status === expectedStatus
        )
        if (run) return
      }
      await new Promise((r) => setTimeout(r, interval))
      elapsed += interval
    }
    const run = state.consoleResponse.find(
      (r: any) =>
        (r.workflowName || r.workflow) === workflowName &&
        r.status === expectedStatus
    )
    expect(run).toBeTruthy()
  }
)

Then(
  'the console response should have a completed run',
  { timeout: 60_000 },
  async function () {
    const maxWait = 50_000
    const interval = 2_000
    let elapsed = 0
    while (elapsed < maxWait) {
      const res = await fetch(`${config.apiUrl}/rpc/console:getWorkflowRuns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      state.consoleResponse = await res.json()
      if (Array.isArray(state.consoleResponse)) {
        const run = state.consoleResponse.find(
          (r: any) => r.status === 'completed'
        )
        if (run) return
      }
      await new Promise((r) => setTimeout(r, interval))
      elapsed += interval
    }
    const run = state.consoleResponse.find((r: any) => r.status === 'completed')
    expect(run).toBeTruthy()
  }
)

When(
  'I call the RPC {string}',
  { timeout: 30_000 },
  async function (rpcName: string) {
    const res = await fetch(`${config.apiUrl}/rpc/${rpcName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    state.rpcResponse = await res.json()
  }
)

Then('the todo {string} should be in the list', function (title: string) {
  const todos = state.rpcResponse?.todos ?? state.rpcResponse
  expect(Array.isArray(todos)).toBeTruthy()
  const found = todos.find(
    (t: any) =>
      typeof t.title === 'string' &&
      t.title.toLowerCase() === title.toLowerCase()
  )
  expect(found).toBeTruthy()
})

Then('the todo {string} should be completed', function (title: string) {
  const todos = state.rpcResponse?.todos ?? state.rpcResponse
  expect(Array.isArray(todos)).toBeTruthy()
  const found = todos.find(
    (t: any) =>
      typeof t.title === 'string' &&
      t.title.toLowerCase() === title.toLowerCase()
  )
  expect(found).toBeTruthy()
  expect(found.completed).toBe(true)
})

Then('a new completed todo should exist', function () {
  const todos = state.rpcResponse?.todos ?? state.rpcResponse
  expect(Array.isArray(todos)).toBeTruthy()
  const seedIds = new Set(['1', '2', '3'])
  const newCompleted = todos.find(
    (t: any) => !seedIds.has(t.id) && t.completed === true
  )
  expect(newCompleted).toBeTruthy()
})

Then('the todo {string} should not be in the list', function (title: string) {
  const todos = state.rpcResponse?.todos ?? state.rpcResponse
  expect(Array.isArray(todos)).toBeTruthy()
  const found = todos.find((t: any) => t.title === title)
  expect(found).toBeFalsy()
})
