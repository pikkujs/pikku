import { When, Then, Before } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { config } from '../support/types.js'
import { randomUUID } from 'crypto'

interface DynamicWorkflowState {
  agentResponse: any
  consoleResponse: any
  rpcResponse: any
  threadId: string
}

const state: DynamicWorkflowState = {
  agentResponse: undefined,
  consoleResponse: undefined,
  rpcResponse: undefined,
  threadId: randomUUID(),
}

Before('@dynamic-workflows', async function () {
  state.threadId = randomUUID()
  state.agentResponse = undefined
  state.consoleResponse = undefined
  state.rpcResponse = undefined
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
  function (workflowName: string, expectedStatus: string) {
    expect(Array.isArray(state.consoleResponse)).toBeTruthy()
    const run = state.consoleResponse.find(
      (r: any) => (r.workflowName || r.workflow) === workflowName
    )
    expect(run).toBeTruthy()
    expect(run.status).toBe(expectedStatus)
  }
)

Then('the console response should have a completed run', function () {
  expect(Array.isArray(state.consoleResponse)).toBeTruthy()
  const run = state.consoleResponse.find((r: any) => r.status === 'completed')
  expect(run).toBeTruthy()
})

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
  console.log('Todos:', JSON.stringify(todos))
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

Then('the todo {string} should not be in the list', function (title: string) {
  const todos = state.rpcResponse?.todos ?? state.rpcResponse
  expect(Array.isArray(todos)).toBeTruthy()
  const found = todos.find((t: any) => t.title === title)
  expect(found).toBeFalsy()
})
