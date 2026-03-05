import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

// Shared state from workflow.steps.ts - import the same reference
let lastRunId: string | undefined

When(
  'I open the workflow {string} in the console',
  { timeout: 30_000 },
  async function (this: AgentWorld, workflowName: string) {
    // Fetch the latest run ID for this workflow via API
    const res = await fetch(`${config.apiUrl}/rpc/console:getWorkflowRuns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { workflowName, limit: 1 } }),
    })
    const runs = await res.json()
    expect(Array.isArray(runs) && runs.length > 0, 'No runs found').toBeTruthy()
    lastRunId = runs[0].id || runs[0].runId

    await this.page.goto(
      `${config.consoleUrl}/workflow?id=${workflowName}&runId=${lastRunId}`
    )
    await this.page.waitForSelector('.react-flow', { timeout: 15_000 })
    // Wait for step states to load
    await this.page.waitForTimeout(2000)
  }
)

Then(
  'the run status should show {string}',
  async function (this: AgentWorld, expectedStatus: string) {
    const tabPanel = this.page.getByRole('tabpanel', { name: 'Run' })
    await expect(tabPanel).toBeVisible({ timeout: 10_000 })
    const statusBadge = tabPanel
      .getByText(expectedStatus, { exact: true })
      .first()
    await expect(statusBadge).toBeVisible({ timeout: 5_000 })
  }
)

Then(
  'the node {string} should have status {string}',
  async function (this: AgentWorld, nodeName: string, expectedStatus: string) {
    const tabPanel = this.page.getByRole('tabpanel', { name: 'Run' })
    const nodeRow = tabPanel.getByRole('row', { name: new RegExp(nodeName) })
    await expect(nodeRow).toBeVisible({ timeout: 5_000 })
    const statusCell = nodeRow.getByText(expectedStatus, { exact: true })
    await expect(statusCell).toBeVisible()
  }
)

Then(
  'the canvas node {string} should be {string}',
  async function (this: AgentWorld, nodeLabel: string, expectedColor: string) {
    const node = this.page
      .locator('.react-flow__node')
      .filter({ hasText: nodeLabel })
      .first()
    await expect(node).toBeVisible({ timeout: 5_000 })

    const bgColor = await node.evaluate((el) => {
      const allEls = el.querySelectorAll('*')
      for (const child of allEls) {
        const bg = (child as HTMLElement).style.backgroundColor
        if (bg && bg !== 'transparent' && !bg.includes('0, 0, 0, 0')) {
          return window.getComputedStyle(child as HTMLElement).backgroundColor
        }
      }
      return ''
    })

    const match = bgColor.match(
      /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+\s*)?\)$/
    )
    if (!match) {
      throw new Error(
        `Canvas node "${nodeLabel}" has no rgb background: "${bgColor}"`
      )
    }
    const [, rs, gs, bs] = match
    const r = Number(rs),
      g = Number(gs),
      b = Number(bs)

    if (expectedColor === 'green') {
      expect(g > r && g > b, `Expected green but got ${bgColor}`).toBeTruthy()
    } else if (expectedColor === 'red') {
      expect(r > g && r > b, `Expected red but got ${bgColor}`).toBeTruthy()
    } else if (expectedColor === 'gray') {
      expect(
        Math.abs(r - g) < 30 && Math.abs(g - b) < 30,
        `Expected gray but got ${bgColor}`
      ).toBeTruthy()
    } else {
      throw new Error(`Unknown expected color: "${expectedColor}"`)
    }
  }
)
