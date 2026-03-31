import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

interface CodeEditorState {
  functionSource: any
  agentSource: any
  functionBody: any
  lastUpdateResult: any
  functionsMeta: any[]
  agentsMeta: any
}

const state: CodeEditorState = {
  functionSource: undefined,
  agentSource: undefined,
  functionBody: undefined,
  lastUpdateResult: undefined,
  functionsMeta: [],
  agentsMeta: undefined,
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

async function getFunctionMeta(funcName: string) {
  if (state.functionsMeta.length === 0) {
    state.functionsMeta = await rpcCall('console:getFunctionsMeta')
  }
  const meta = state.functionsMeta.find(
    (f: any) => f.name === funcName || f.pikkuFuncId === funcName
  )
  if (!meta) throw new Error(`Function "${funcName}" not found in meta`)
  return meta
}

async function getAgentMeta(agentKey: string) {
  if (!state.agentsMeta) {
    const allMeta = await rpcCall('console:getAllMeta')
    state.agentsMeta = allMeta.agentsMeta || {}
  }
  const meta = state.agentsMeta[agentKey]
  if (!meta) throw new Error(`Agent "${agentKey}" not found in meta`)
  return meta
}

// --- Function Source ---

When(
  'I read the source of function {string}',
  async function (this: AgentWorld, funcName: string) {
    const meta = await getFunctionMeta(funcName)
    state.functionSource = await rpcCall('console:readFunctionSource', {
      sourceFile: meta.sourceFile,
      exportedName: meta.exportedName,
    })
  }
)

Then(
  'the function source should have wrapper {string}',
  function (wrapper: string) {
    expect(state.functionSource.wrapperName).toBe(wrapper)
  }
)

Then(
  'the function config {string} should be {string}',
  function (key: string, expected: string) {
    expect(String(state.functionSource.config[key])).toBe(expected)
  }
)

Then('the function config {string} should be true', function (key: string) {
  expect(state.functionSource.config[key]).toBe(true)
})

Then('the function body should contain {string}', function (text: string) {
  const body = state.functionBody?.body || state.functionSource?.body
  expect(body).toContain(text)
})

// --- Function Config Update ---

When(
  'I update the function {string} config:',
  async function (this: AgentWorld, funcName: string, table: any) {
    const meta = await getFunctionMeta(funcName)
    const rows = table.rawTable || table.raw()
    const changes: Record<string, unknown> = {}
    for (let i = 1; i < rows.length; i++) {
      const [key, value] = rows[i]
      if (value === 'true') changes[key] = true
      else if (value === 'false') changes[key] = false
      else if (value === 'null') changes[key] = null
      else if (!isNaN(Number(value)) && value !== '')
        changes[key] = Number(value)
      else changes[key] = value
    }
    state.lastUpdateResult = await rpcCall('console:updateFunctionConfig', {
      sourceFile: meta.sourceFile,
      exportedName: meta.exportedName,
      changes,
    })
    // Clear cached meta so next read picks up rebuilt data
    state.functionsMeta = []
    state.functionSource = undefined
  }
)

Then('the update should succeed', function () {
  expect(state.lastUpdateResult.success).toBe(true)
})

// --- Function Body ---

When(
  'I read the body of function {string}',
  async function (this: AgentWorld, funcName: string) {
    const meta = await getFunctionMeta(funcName)
    state.functionBody = await rpcCall('console:readFunctionBody', {
      sourceFile: meta.sourceFile,
      exportedName: meta.exportedName,
    })
  }
)

When(
  'I update the function {string} body to:',
  { timeout: 60_000 },
  async function (this: AgentWorld, funcName: string, docString: string) {
    const meta = await getFunctionMeta(funcName)
    state.lastUpdateResult = await rpcCall('console:updateFunctionBody', {
      sourceFile: meta.sourceFile,
      exportedName: meta.exportedName,
      body: docString,
    })
    state.functionsMeta = []
    state.functionBody = undefined
  }
)

// --- Agent Source ---

When(
  'I read the source of agent {string}',
  async function (this: AgentWorld, agentKey: string) {
    const meta = await getAgentMeta(agentKey)
    state.agentSource = await rpcCall('console:readAgentSource', {
      sourceFile: meta.sourceFile,
      exportedName: meta.exportedName,
    })
  }
)

Then(
  'the agent config {string} should be {string}',
  function (key: string, expected: string) {
    expect(String(state.agentSource.config[key])).toBe(expected)
  }
)

Then(
  'the agent config {string} should be {int}',
  function (key: string, expected: number) {
    expect(state.agentSource.config[key]).toBe(expected)
  }
)

// --- Agent Config Update ---

When(
  'I update the agent {string} config:',
  { timeout: 60_000 },
  async function (this: AgentWorld, agentKey: string, table: any) {
    const meta = await getAgentMeta(agentKey)
    const rows = table.rawTable || table.raw()
    const changes: Record<string, unknown> = {}
    for (let i = 1; i < rows.length; i++) {
      const [key, value] = rows[i]
      if (value === 'true') changes[key] = true
      else if (value === 'false') changes[key] = false
      else if (value === 'null') changes[key] = null
      else if (!isNaN(Number(value)) && value !== '')
        changes[key] = Number(value)
      else changes[key] = value
    }
    state.lastUpdateResult = await rpcCall('console:updateAgentConfig', {
      sourceFile: meta.sourceFile,
      exportedName: meta.exportedName,
      changes,
    })
    state.agentsMeta = undefined
    state.agentSource = undefined
  }
)

// --- Console UI ---

When('I navigate to the functions page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/functions`)
  await this.page.waitForSelector('table', { timeout: 15_000 })
})

When(
  'I click on function {string}',
  async function (this: AgentWorld, funcName: string) {
    const row = this.page.locator('table tbody tr', { hasText: funcName })
    await row.first().click()
    await this.page.waitForTimeout(500)
  }
)

When('I navigate to the agents page', async function (this: AgentWorld) {
  await this.page.goto(`${config.consoleUrl}/agents`)
  await this.page.waitForTimeout(1000)
})

When(
  'I click on agent {string}',
  async function (this: AgentWorld, agentKey: string) {
    const badge = this.page
      .locator('[data-agent-id]', { hasText: agentKey })
      .first()
    if (await badge.isVisible()) {
      await badge.click()
    } else {
      // Try clicking text that matches the agent name
      await this.page.getByText(agentKey, { exact: false }).first().click()
    }
    await this.page.waitForTimeout(500)
  }
)

Then('I should see the edit button', async function (this: AgentWorld) {
  const editButton = this.page.locator(
    'button[title="Edit function"], button[title="Edit agent"]'
  )
  await expect(editButton.first()).toBeVisible({ timeout: 10_000 })
})
