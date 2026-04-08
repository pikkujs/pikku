import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

interface DynamicWorkflowState {
  functionList: { name: string; description: string }[]
  schemaDetails: string
  validationResult: { valid: boolean; errors: string[]; entryNodeIds: string[] }
  generatedWorkflowName: string | null
  generatedRunId: string | null
  runResult: any
}

const state: DynamicWorkflowState = {
  functionList: [],
  schemaDetails: '',
  validationResult: { valid: false, errors: [], entryNodeIds: [] },
  generatedWorkflowName: null,
  generatedRunId: null,
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

// --- List / Schema / Validate steps ---

When('I list dynamic functions', async function (this: AgentWorld) {
  const result = await rpcCall('dynamic-workflows:listDynamicFunctions')
  state.functionList = result.summaries
})

Then('the function list should not be empty', function () {
  expect(state.functionList.length).toBeGreaterThan(0)
})

Then('the function list should not contain internal functions', function () {
  const internalPrefixes = [
    'pikkuWorkflow',
    'pikkuRemote',
    'pikkuConsole',
    'http:',
    'graphStart:',
  ]
  for (const fn of state.functionList) {
    for (const prefix of internalPrefixes) {
      expect(fn.name.startsWith(prefix)).toBe(false)
    }
  }
})

Then(
  'the function list should contain {string}',
  function (this: AgentWorld, name: string) {
    const found = state.functionList.some((f) => f.name === name)
    expect(found).toBe(true)
  }
)

When(
  'I get schemas for functions:',
  async function (this: AgentWorld, table: any) {
    const rows = table.rawTable || table.raw()
    const names = rows.slice(1).map((r: string[]) => r[0])
    const result = await rpcCall('dynamic-workflows:getFunctionSchemas', {
      names,
    })
    state.schemaDetails = result.details
  }
)

Then(
  'the schema details should contain {string}',
  function (this: AgentWorld, expected: string) {
    expect(state.schemaDetails).toContain(expected)
  }
)

When(
  'I validate the workflow graph:',
  async function (this: AgentWorld, docString: string) {
    const input = JSON.parse(docString)
    state.validationResult = await rpcCall(
      'dynamic-workflows:validateDynamicWorkflow',
      input
    )
  }
)

Then('the validation should pass', function () {
  expect(state.validationResult.valid).toBe(true)
})

Then('the validation should fail', function () {
  expect(state.validationResult.valid).toBe(false)
})

Then(
  'the entry nodes should include {string}',
  function (this: AgentWorld, nodeId: string) {
    expect(state.validationResult.entryNodeIds).toContain(nodeId)
  }
)

Then(
  'the validation errors should mention {string}',
  function (this: AgentWorld, expected: string) {
    expect(state.validationResult.errors.join(' ')).toContain(expected)
  }
)

// --- Generate workflow (AI) steps ---

When(
  'I generate a dynamic workflow with:',
  { timeout: 120_000 },
  async function (this: AgentWorld, table: any) {
    const input = parseInput(table)
    const functionFilter = input.functionFilter
      ? String(input.functionFilter)
          .split(',')
          .map((s: string) => s.trim())
      : undefined

    const startRes = await fetch(
      `${config.apiUrl}/workflow/dynamic-workflows:generateDynamicWorkflow/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { prompt: input.prompt, functionFilter },
        }),
      }
    )
    const startBody = await startRes.json()
    state.generatedRunId = startBody.runId
    expect(state.generatedRunId).toBeTruthy()

    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      const statusRes = await fetch(
        `${config.apiUrl}/workflow/dynamic-workflows:generateDynamicWorkflow/status/${state.generatedRunId}`
      )
      const status = await statusRes.json()
      if (status.status === 'completed') {
        state.runResult = status
        state.generatedWorkflowName = status.output?.workflowName ?? null
        return
      }
      if (status.status === 'failed' || status.status === 'cancelled') {
        state.runResult = status
        return
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error('Dynamic workflow generation timed out')
  }
)

Then('the dynamic workflow generation should complete', function () {
  expect(state.runResult?.status).toBe('completed')
})

Then('the generated workflow should have a name', function () {
  if (!state.generatedWorkflowName) {
    const output = state.runResult?.output
    throw new Error(
      `Workflow generation returned success=${output?.success}, workflowName='${output?.workflowName}'. ` +
        `The AI may have failed to produce a valid graph after 3 attempts.`
    )
  }
  expect(state.generatedWorkflowName).toBeTruthy()
})

// --- Run generated workflow steps ---

When(
  'I run the generated dynamic workflow with:',
  { timeout: 60_000 },
  async function (this: AgentWorld, table: any) {
    const input = parseInput(table)
    expect(state.generatedWorkflowName).toBeTruthy()
    const startRes = await fetch(
      `${config.apiUrl}/workflow/${state.generatedWorkflowName}/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: input }),
      }
    )
    if (!startRes.ok) {
      const body = await startRes.text()
      throw new Error(`Workflow start failed (${startRes.status}): ${body}`)
    }
    const { runId } = await startRes.json()

    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const statusRes = await fetch(
        `${config.apiUrl}/workflow/${state.generatedWorkflowName}/status/${runId}`
      )
      const status = await statusRes.json()
      if (status.status === 'completed' || status.status === 'failed') {
        state.runResult = status
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('Dynamic workflow run timed out')
  }
)

Then('the dynamic workflow run should complete', function () {
  expect(state.runResult).toBeTruthy()
  expect(state.runResult.status).toBe('completed')
})

// --- UI steps ---

When('I navigate to the new workflow page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/workflow/new`)
  await this.page.waitForTimeout(2000)
})

Then(
  'I should see the workflow prompt textarea',
  async function (this: AgentWorld) {
    const textarea = this.page.getByRole('textbox', { name: /describe/i })
    await expect(textarea).toBeVisible({ timeout: 10_000 })
  }
)

Then(
  'I should see the generate workflow button',
  async function (this: AgentWorld) {
    const button = this.page.getByRole('button', { name: /generate workflow/i })
    await expect(button).toBeVisible({ timeout: 10_000 })
  }
)

Then(
  'I should see the function filter select',
  async function (this: AgentWorld) {
    const select = this.page.getByPlaceholder(/all functions/i)
    await expect(select).toBeVisible({ timeout: 10_000 })
  }
)

When('I navigate to the workflows page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/workflow`)
  await this.page.waitForTimeout(2000)
})

When('I click the new workflow button', async function (this: AgentWorld) {
  const button = this.page.getByRole('button', { name: /new workflow/i })
  await button.click()
  await this.page.waitForTimeout(1000)
})

Then('I should be on the new workflow page', async function (this: AgentWorld) {
  await expect(this.page).toHaveURL(/workflow\/new/, { timeout: 10_000 })
  const heading = this.page.getByText('/ New Workflow')
  await expect(heading).toBeVisible({ timeout: 10_000 })
})

When(
  'I enter the workflow prompt {string}',
  async function (this: AgentWorld, prompt: string) {
    const textarea = this.page.getByRole('textbox', { name: /describe/i })
    await textarea.fill(prompt)
  }
)

When('I click the generate workflow button', async function (this: AgentWorld) {
  const button = this.page.getByRole('button', { name: /generate workflow/i })
  await button.click()
})

Then(
  'I should see the generation timeline',
  { timeout: 60_000 },
  async function (this: AgentWorld) {
    const step = this.page.getByText(
      /understanding your request|listing available/i
    )
    await expect(step.first()).toBeVisible({ timeout: 30_000 })
  }
)

Then(
  'the generation should complete with success',
  { timeout: 180_000 },
  async function (this: AgentWorld) {
    const alert = this.page.getByText('Workflow created')
    await expect(alert).toBeVisible({ timeout: 120_000 })
  }
)

When('I click the view workflow button', async function (this: AgentWorld) {
  const button = this.page.getByRole('button', { name: /view workflow/i })
  await button.click()
  await this.page.waitForTimeout(3000)
})

Then(
  'I should see the workflow graph canvas',
  async function (this: AgentWorld) {
    const canvas = this.page.locator('.react-flow')
    await expect(canvas).toBeVisible({ timeout: 15_000 })
  }
)

When(
  'I run the workflow from the console with:',
  { timeout: 60_000 },
  async function (this: AgentWorld, table: any) {
    const input = parseInput(table)
    const url = this.page.url()
    const workflowId = new URL(url).searchParams.get('id')
    expect(workflowId).toBeTruthy()

    const startRes = await fetch(
      `${config.apiUrl}/workflow/${workflowId}/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: input }),
      }
    )
    if (!startRes.ok) {
      const body = await startRes.text()
      throw new Error(`Workflow start failed (${startRes.status}): ${body}`)
    }
    const { runId } = await startRes.json()
    expect(runId).toBeTruthy()

    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const statusRes = await fetch(
        `${config.apiUrl}/workflow/${workflowId}/status/${runId}`
      )
      const status = await statusRes.json()
      if (status.status === 'completed' || status.status === 'failed') {
        state.runResult = status
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('Dynamic workflow run timed out')
  }
)

Then('the workflow run should show as completed', function () {
  expect(state.runResult).toBeTruthy()
  expect(state.runResult.status).toBe('completed')
})
