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
  const headers = rows[0]
  const values = rows[1]
  const result: Record<string, any> = {}
  for (let i = 0; i < headers.length; i++) {
    const val = values[i]
    if (val === 'true') result[headers[i]] = true
    else if (val === 'false') result[headers[i]] = false
    else if (!isNaN(Number(val)) && val !== '') result[headers[i]] = Number(val)
    else result[headers[i]] = val
  }
  return result
}

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
