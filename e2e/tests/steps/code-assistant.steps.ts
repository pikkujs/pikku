import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

interface DynamicAgentState {
  toolList: { name: string; description: string }[]
  schemaDetails: string
  middlewareList: {
    name: string
    description: string
    requiresService: string
  }[]
  validationResult: { valid: boolean; errors: string[] }
  generatedAgentName: string | null
  generatedRunId: string | null
  generatedFilePath: string | null
  runResult: any
}

const state: DynamicAgentState = {
  toolList: [],
  schemaDetails: '',
  middlewareList: [],
  validationResult: { valid: false, errors: [] },
  generatedAgentName: null,
  generatedRunId: null,
  generatedFilePath: null,
  runResult: undefined,
}

async function rpcCall(name: string, data: any = {}): Promise<any> {
  const res = await fetch(`${config.apiUrl}/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`RPC ${name} failed (${res.status}): ${body}`)
  }
  return res.json()
}

function parseInput(table: any): Record<string, any> {
  const rows = table.rawTable || table.raw()
  if (!Array.isArray(rows) || rows.length < 2) return {}
  const headers = rows[0]
  const values = rows[1]
  const result: Record<string, any> = {}
  for (let i = 0; i < Math.min(headers.length, values.length); i++) {
    const val = values[i]
    if (val === 'true') result[headers[i]] = true
    else if (val === 'false') result[headers[i]] = false
    else if (!isNaN(Number(val)) && val !== '') result[headers[i]] = Number(val)
    else result[headers[i]] = val
  }
  return result
}

When('I list available agent tools', async function (this: AgentWorld) {
  const result = await rpcCall('code-assistant:listAvailableTools')
  state.toolList = result.summaries
})

Then('the agent tool list should not be empty', function () {
  expect(state.toolList.length).toBeGreaterThan(0)
})

Then('the agent tool list should not contain internal functions', function () {
  const internalPrefixes = [
    'pikkuWorkflow',
    'pikkuRemote',
    'pikkuConsole',
    'http:',
    'graphStart:',
  ]
  for (const fn of state.toolList) {
    for (const prefix of internalPrefixes) {
      expect(fn.name.startsWith(prefix)).toBe(false)
    }
  }
})

Then(
  'the agent tool list should contain {string}',
  function (this: AgentWorld, name: string) {
    const found = state.toolList.some((f) => f.name === name)
    expect(found).toBe(true)
  }
)

When(
  'I get agent tool schemas for:',
  async function (this: AgentWorld, table: any) {
    const rows = table.rawTable || table.raw()
    const names = rows.slice(1).map((r: string[]) => r[0])
    const result = await rpcCall('code-assistant:getToolSchemas', { names })
    state.schemaDetails = result.details
  }
)

Then(
  'the agent schema details should contain {string}',
  function (this: AgentWorld, expected: string) {
    expect(state.schemaDetails).toContain(expected)
  }
)

When('I list available agent middleware', async function (this: AgentWorld) {
  const result = await rpcCall('code-assistant:listAvailableMiddleware')
  state.middlewareList = result.aiMiddleware
})

Then(
  'the middleware list should include {string}',
  function (this: AgentWorld, name: string) {
    const found = state.middlewareList.some((m) => m.name === name)
    expect(found).toBe(true)
  }
)

When(
  'I validate the agent config:',
  async function (this: AgentWorld, docString: string) {
    const input = JSON.parse(docString)
    state.validationResult = await rpcCall(
      'code-assistant:validateAgentConfig',
      input
    )
  }
)

Then('the agent config validation should pass', function () {
  expect(state.validationResult.valid).toBe(true)
})

Then('the agent config validation should fail', function () {
  expect(state.validationResult.valid).toBe(false)
})

Then(
  'the agent config errors should mention {string}',
  function (this: AgentWorld, expected: string) {
    expect(state.validationResult.errors.join(' ').toLowerCase()).toContain(
      expected.toLowerCase()
    )
  }
)

When(
  'I generate a dynamic agent with:',
  { timeout: 120_000 },
  async function (this: AgentWorld, table: any) {
    const input = parseInput(table)
    const toolFilter = input.toolFilter
      ? String(input.toolFilter)
          .split(',')
          .map((s: string) => s.trim())
      : undefined

    const startRes = await fetch(
      `${config.apiUrl}/workflow/code-assistant:generateDynamicAgent/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { prompt: input.prompt, toolFilter } }),
      }
    )
    const startBody = await startRes.json()
    state.generatedRunId = startBody.runId
    expect(state.generatedRunId).toBeTruthy()

    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const statusRes = await fetch(
        `${config.apiUrl}/workflow/code-assistant:generateDynamicAgent/status/${state.generatedRunId}`
      )
      const status = await statusRes.json()
      if (status.status === 'completed') {
        state.runResult = status
        state.generatedAgentName = status.output?.agentName ?? null
        state.generatedFilePath = status.output?.filePath ?? null
        return
      }
      if (status.status === 'failed' || status.status === 'cancelled') {
        state.runResult = status
        return
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error('Dynamic agent generation timed out')
  }
)

Then('the dynamic agent generation should complete', function () {
  expect(state.runResult?.status).toBe('completed')
})

Then('the generated agent should have a name', function () {
  if (!state.generatedAgentName) {
    const output = state.runResult?.output
    throw new Error(
      `Agent generation returned success=${output?.success}, agentName='${output?.agentName}'. ` +
        `The AI may have failed to produce a valid config after 3 attempts.`
    )
  }
  expect(state.generatedAgentName).toBeTruthy()
})

Then('the generated agent should have a file path', function () {
  expect(state.generatedFilePath).toBeTruthy()
})

When('I navigate to the new agent page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/agents/new`)
  await this.page.waitForTimeout(2000)
})

Then(
  'I should see the agent prompt textarea',
  async function (this: AgentWorld) {
    const textarea = this.page.getByRole('textbox', { name: /describe/i })
    await expect(textarea).toBeVisible({ timeout: 10_000 })
  }
)

Then(
  'I should see the generate agent button',
  async function (this: AgentWorld) {
    const button = this.page.getByRole('button', { name: /generate agent/i })
    await expect(button).toBeVisible({ timeout: 10_000 })
  }
)

Then(
  'I should see the agent tool filter select',
  async function (this: AgentWorld) {
    const select = this.page.getByPlaceholder(/all tools|all functions/i)
    await expect(select).toBeVisible({ timeout: 10_000 })
  }
)

Then('I should see the sub-agents toggle', async function (this: AgentWorld) {
  const toggle = this.page.getByText(/sub-agent delegation/i)
  await expect(toggle).toBeVisible({ timeout: 10_000 })
})

When(
  'I click the new agent button',
  { timeout: 30_000 },
  async function (this: AgentWorld) {
    await this.page.goto(`${config.consoleUrl}/agents`)
    await this.page.waitForTimeout(2000)
    const button = this.page.getByRole('button', { name: /new agent/i })
    await button.click()
    await this.page.waitForTimeout(1000)
  }
)

Then('I should be on the new agent page', async function (this: AgentWorld) {
  await expect(this.page).toHaveURL(/agents\/new/, { timeout: 10_000 })
})

When(
  'I enter the agent prompt {string}',
  async function (this: AgentWorld, prompt: string) {
    const textarea = this.page.getByRole('textbox', { name: /describe/i })
    await textarea.fill(prompt)
  }
)

When('I click the generate agent button', async function (this: AgentWorld) {
  const button = this.page.getByRole('button', { name: /generate agent/i })
  await button.click()
})

Then(
  'I should see the agent generation timeline',
  { timeout: 60_000 },
  async function (this: AgentWorld) {
    const step = this.page.getByText(
      /understanding your request|listing available/i
    )
    await expect(step.first()).toBeVisible({ timeout: 30_000 })
  }
)

Then(
  'the agent generation should complete with success',
  { timeout: 180_000 },
  async function (this: AgentWorld) {
    const alert = this.page.getByText('Agent created')
    await expect(alert).toBeVisible({ timeout: 120_000 })
  }
)
