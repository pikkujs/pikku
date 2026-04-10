import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

interface CodeAssistantState {
  generatedRunId: string | null
  runResult: any
  generatedAgentName: string | null
  generatedFilePath: string | null
}

const state: CodeAssistantState = {
  generatedRunId: null,
  runResult: undefined,
  generatedAgentName: null,
  generatedFilePath: null,
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

// --- Generate workflow (AI) steps ---

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
      if (status.status === 'failed') {
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
  expect(state.runResult?.output?.success).toBe(true)
})

Then('the generated agent should have a name', function () {
  expect(state.generatedAgentName).toBeTruthy()
})

Then('the generated agent should have a file path', function () {
  expect(state.generatedFilePath).toBeTruthy()
  expect(state.generatedFilePath).toContain('.agent.ts')
})

// --- UI steps ---

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
