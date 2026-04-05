import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

interface WorkflowState {
  lastResponse: any
  lastRunId: string | undefined
  lastStatus: string | undefined
  consoleResponse: any
}

const state: WorkflowState = {
  lastResponse: undefined,
  lastRunId: undefined,
  lastStatus: undefined,
  consoleResponse: undefined,
}

function parseInput(table: any, docString?: string): Record<string, any> {
  if (docString) {
    return JSON.parse(docString)
  }
  if (!table) {
    return {}
  }
  const rows = table.rawTable || table.raw()
  if (!Array.isArray(rows) || rows.length < 2) {
    return {}
  }
  const headers = rows[0]
  const values = rows[1]
  if (!Array.isArray(headers) || !Array.isArray(values)) {
    return {}
  }
  const result: Record<string, any> = {}
  const len = Math.min(headers.length, values.length)
  for (let i = 0; i < len; i++) {
    const key = headers[i]
    const val = values[i]
    if (val === 'true') result[key] = true
    else if (val === 'false') result[key] = false
    else if (!isNaN(Number(val)) && val !== '') result[key] = Number(val)
    else result[key] = val
  }
  return result
}

Given('the API is available', async function (this: AgentWorld) {
  const res = await fetch(config.apiUrl)
  expect(res.ok || res.status === 404).toBeTruthy()
})

When(
  'I run the {string} workflow with:',
  { timeout: 60_000 },
  async function (this: AgentWorld, workflowName: string, tableOrDoc: any) {
    const input =
      typeof tableOrDoc === 'string'
        ? JSON.parse(tableOrDoc)
        : parseInput(tableOrDoc)
    const res = await fetch(`${config.apiUrl}/workflow/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowName, data: input }),
    })
    state.lastResponse = await res.json().catch(() => null)
    state.lastStatus = res.ok ? 'completed' : undefined

    if (state.lastResponse?.runId) {
      state.lastRunId = state.lastResponse.runId
    }

    if (state.lastResponse?.status === 'failed') {
      state.lastStatus = 'failed'
    } else if (state.lastResponse?.status === 'cancelled') {
      state.lastStatus = 'cancelled'
    } else if (!res.ok && state.lastResponse?.error) {
      const errorMsg =
        state.lastResponse.error?.message ||
        state.lastResponse.error?.reason ||
        ''
      if (errorMsg.includes('cancelled') || errorMsg.includes('Cancelled')) {
        state.lastStatus = 'cancelled'
      } else {
        state.lastStatus = 'failed'
      }
    }
  }
)

When(
  'I start the {string} workflow with:',
  { timeout: 60_000 },
  async function (this: AgentWorld, workflowName: string, tableOrDoc: any) {
    const input =
      typeof tableOrDoc === 'string'
        ? JSON.parse(tableOrDoc)
        : parseInput(tableOrDoc)
    const res = await fetch(`${config.apiUrl}/workflow/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowName, data: input }),
    })
    state.lastResponse = await res.json()
    if (state.lastResponse?.runId) {
      state.lastRunId = state.lastResponse.runId
    }
  }
)

When(
  'I start the {string} graph workflow with:',
  { timeout: 60_000 },
  async function (this: AgentWorld, graphName: string, tableOrDoc: any) {
    const input =
      typeof tableOrDoc === 'string'
        ? JSON.parse(tableOrDoc)
        : parseInput(tableOrDoc)
    const res = await fetch(`${config.apiUrl}/workflow/${graphName}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    state.lastResponse = await res.json()
    if (state.lastResponse?.runId) {
      state.lastRunId = state.lastResponse.runId
    }
  }
)

Then('the workflow should complete successfully', function () {
  expect(state.lastStatus).toBe('completed')
})

Then('the workflow should fail', function () {
  expect(state.lastStatus).toBe('failed')
})

Then('the workflow should be cancelled', function () {
  expect(state.lastStatus).toBe('cancelled')
})

Then(
  'the workflow output {string} should be {int}',
  function (key: string, expected: number) {
    expect(state.lastResponse?.[key]).toBe(expected)
  }
)

Then(
  'the workflow output {string} should be {string}',
  function (key: string, expected: string) {
    expect(String(state.lastResponse?.[key])).toBe(expected)
  }
)

Then('the workflow output {string} should be true', function (key: string) {
  expect(state.lastResponse?.[key]).toBe(true)
})

Then('I should receive a run ID', function () {
  expect(state.lastRunId).toBeTruthy()
  expect(typeof state.lastRunId).toBe('string')
})

When(
  'I poll until the workflow completes',
  { timeout: 60_000 },
  async function () {
    const maxWaitMs = 45_000
    const pollIntervalMs = 1_000
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      const res = await fetch(`${config.apiUrl}/workflow/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { runId: state.lastRunId } }),
      })
      const body = await res.json()

      if (
        body.status === 'completed' ||
        body.status === 'failed' ||
        body.status === 'cancelled'
      ) {
        state.lastStatus = body.status
        state.lastResponse = body
        return
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }
    throw new Error('Workflow did not complete within timeout')
  }
)

Then('the workflow status should be {string}', function (expected: string) {
  expect(state.lastStatus).toBe(expected)
})

When(
  'I query console RPC {string}',
  { timeout: 30_000 },
  async function (this: AgentWorld, rpcName: string) {
    const res = await fetch(`${config.apiUrl}/rpc/${rpcName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    state.consoleResponse = await res.json()
  }
)

When(
  'I query console RPC {string} with the last run ID',
  { timeout: 30_000 },
  async function (this: AgentWorld, rpcName: string) {
    expect(state.lastRunId).toBeTruthy()
    const res = await fetch(`${config.apiUrl}/rpc/${rpcName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { runId: state.lastRunId } }),
    })
    state.consoleResponse = await res.json()
  }
)

Then('the console response should contain runs', function () {
  expect(Array.isArray(state.consoleResponse)).toBeTruthy()
})

Then('the console response should contain run details', function () {
  expect(state.consoleResponse).toBeTruthy()
  expect(state.consoleResponse.id || state.consoleResponse.runId).toBeTruthy()
})

Then('the console response should contain steps', function () {
  expect(Array.isArray(state.consoleResponse)).toBeTruthy()
})

Then('the console response should contain history entries', function () {
  expect(Array.isArray(state.consoleResponse)).toBeTruthy()
})

Then('the console response should contain workflow names', function () {
  expect(Array.isArray(state.consoleResponse)).toBeTruthy()
  expect(state.consoleResponse.length).toBeGreaterThan(0)
})

Then('the console delete response should be successful', function () {
  expect(state.consoleResponse).toBeTruthy()
})
