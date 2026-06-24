import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

When(
  'I open the Gateways tab in the console',
  { timeout: 30_000 },
  async function (this: AgentWorld) {
    await this.page.goto(`${config.consoleUrl}/apis?tab=gateways`)
    await this.page.waitForSelector('table', { timeout: 15_000 })
  }
)

Then(
  'I should see gateway {string} with route {string}',
  { timeout: 10_000 },
  async function (this: AgentWorld, gatewayName: string, route: string) {
    const row = this.page.locator('table tbody tr', { hasText: gatewayName })
    await expect(row.first()).toBeVisible({ timeout: 5_000 })
    await expect(row.first()).toContainText(route)
  }
)
