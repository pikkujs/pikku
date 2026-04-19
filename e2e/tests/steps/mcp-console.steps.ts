import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

When(
  'I open the MCP tab in the console',
  { timeout: 30_000 },
  async function (this: AgentWorld) {
    await this.page.goto(`${config.consoleUrl}/mcp`)
    await this.page.waitForTimeout(2000)
  }
)

Then(
  'I should see MCP tool {string} without a warning',
  { timeout: 10_000 },
  async function (this: AgentWorld, toolName: string) {
    const listItem = this.page.locator('text=' + toolName).first()
    await expect(listItem).toBeVisible({ timeout: 5_000 })

    const parent = listItem
      .locator(
        'xpath=ancestor::*[contains(@class, "listItem") or contains(@class, "item")]'
      )
      .first()
    const warning = parent.locator('text=⚠')
    await expect(warning).not.toBeVisible()
  }
)

Then(
  'I should see MCP tool {string} with a missing description warning',
  { timeout: 10_000 },
  async function (this: AgentWorld, toolName: string) {
    const listItem = this.page.locator('text=' + toolName).first()
    await expect(listItem).toBeVisible({ timeout: 5_000 })

    await listItem.click()
    await this.page.waitForTimeout(500)

    const warningBanner = this.page.locator('text=Missing description')
    await expect(warningBanner).toBeVisible({ timeout: 5_000 })
  }
)
